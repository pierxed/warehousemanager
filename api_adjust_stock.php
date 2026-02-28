<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
  require_method('POST');
  $data = read_json_body();

  $lot_id = int_in($data, 'lot_id', 0);
  $qty = int_in($data, 'quantity', 0);
  $direction = str_in($data, 'direction', 'IN'); // IN | OUT
  $reason = str_in($data, 'reason', null);
  $note = str_in($data, 'note', null);

  if ($lot_id <= 0 || $qty <= 0) {
    json_out(['success'=>false,'code'=>'INVALID_INPUT','error'=>'lot_id e quantity sono obbligatori'], 400);
  }

  $direction = strtoupper(trim((string)$direction));
  if (!in_array($direction, ['IN','OUT'], true)) {
    json_out(['success'=>false,'code'=>'INVALID_DIRECTION','error'=>'direction deve essere IN o OUT'], 400);
  }

  $allowedReasons = ['ROTTURA','RESO','MODIFICA_FORZATA','INVENTARIO','ALTRO'];
  $reason = strtoupper(trim((string)$reason));
  if ($reason === '' || !in_array($reason, $allowedReasons, true)) {
    json_out([
      'success'=>false,
      'code'=>'INVALID_REASON',
      'error'=>'Motivo non valido',
      'allowed'=>$allowedReasons
    ], 400);
  }

  if ($note !== null) {
    $note = trim((string)$note);
    if ($note === '') $note = null;
    if ($note !== null && mb_strlen($note) > 255) {
      json_out(['success'=>false,'code'=>'NOTE_TOO_LONG','error'=>'Nota troppo lunga (max 255 caratteri)'], 400);
    }
  }

  $signedQty = ($direction === 'OUT') ? -abs($qty) : abs($qty);

  $pdo->beginTransaction();

  // Lock del lotto (evita race con altre rettifiche/vendite)
  $stmtLot = $pdo->prepare("SELECT id, product_id FROM lots WHERE id = ? FOR UPDATE");
  $stmtLot->execute([$lot_id]);
  $lot = $stmtLot->fetch(PDO::FETCH_ASSOC);

  if (!$lot) {
    $pdo->rollBack();
    json_out(['success'=>false,'code'=>'LOT_NOT_FOUND','error'=>'Lotto non trovato'], 404);
  }

  $product_id = (int)$lot['product_id'];

  // Stock attuale del lotto (PRODUCTION - SALE + ADJUSTMENT)
  $stmtStock = $pdo->prepare(
    "SELECT COALESCE(SUM(CASE "
    . "WHEN type='PRODUCTION' THEN quantity "
    . "WHEN type='SALE' THEN -quantity "
    . "WHEN type='ADJUSTMENT' THEN quantity "
    . "ELSE 0 END), 0) AS stock "
    . "FROM movements WHERE lot_id = ?"
  );
  $stmtStock->execute([$lot_id]);
  $currentStock = (int)($stmtStock->fetchColumn() ?: 0);

  if ($signedQty < 0 && ($currentStock + $signedQty) < 0) {
    $pdo->rollBack();
    json_out([
      'success'=>false,
      'code'=>'INSUFFICIENT_STOCK',
      'error'=>'Stock insufficiente per rettifica in uscita',
      'available'=>$currentStock,
      'requested'=>abs($signedQty)
    ], 409);
  }

  $stmtIns = $pdo->prepare(
    "INSERT INTO movements (product_id, lot_id, quantity, type, reason, note) "
    . "VALUES (?, ?, ?, 'ADJUSTMENT', ?, ?)"
  );
  $stmtIns->execute([$product_id, $lot_id, $signedQty, $reason, $note]);

  $newStock = $currentStock + $signedQty;

  $pdo->commit();

  json_out([
    'success'=>true,
    'lot_id'=>$lot_id,
    'product_id'=>$product_id,
    'direction'=>$direction,
    'reason'=>$reason,
    'quantity'=>abs($qty),
    'signed_quantity'=>$signedQty,
    'stock_before'=>$currentStock,
    'stock_after'=>$newStock
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  json_out(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}
