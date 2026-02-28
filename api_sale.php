<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
  require_method('POST');
  $data = read_json_body();

  $product_id = int_in($data['product_id'] ?? 0);
  $qtyToSell  = int_in($data['quantity'] ?? 0);
  if ($product_id <= 0 || $qtyToSell <= 0) {
    json_out(['success' => false, 'error' => 'Dati mancanti'], 400);
  }

  // --- FIFO corretto (FEFO): prima scadenza batch, poi produzione batch, poi lot_id ---
  // expiration_date / production_date stanno su batches, NON su lots.
  // Facciamo lock per evitare vendite concorrenti che bucano lo stock.
  $pdo->beginTransaction();

  $stmt = $pdo->prepare(
    "SELECT "
    . "l.id AS lot_id, "
    . "b.lot_number, b.expiration_date, b.production_date, "
    . "COALESCE(SUM(CASE "
    . "WHEN m.type='PRODUCTION' THEN m.quantity "
    . "WHEN m.type='SALE' THEN -m.quantity "
    . "WHEN m.type='ADJUSTMENT' THEN m.quantity "
    . "ELSE 0 END), 0) AS stock "
    . "FROM lots l "
    . "JOIN batches b ON b.id = l.batch_id "
    . "LEFT JOIN movements m ON m.lot_id = l.id "
    . "WHERE l.product_id = ? "
    . "GROUP BY l.id, b.lot_number, b.expiration_date, b.production_date "
    . "HAVING stock > 0 "
    . "ORDER BY b.expiration_date ASC, b.production_date ASC, l.id ASC "
    . "FOR UPDATE"
  );
  $stmt->execute([$product_id]);
  $fifoLots = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $totalAvailable = 0;
  foreach ($fifoLots as $row) $totalAvailable += (int)$row['stock'];

  if ($totalAvailable < $qtyToSell) {
    $pdo->rollBack();
    json_out([
      'success' => false,
      'error' => 'Stock insufficiente',
      'available' => $totalAvailable,
    ], 409);
  }

  $stmtIns = $pdo->prepare(
    "INSERT INTO movements (product_id, lot_id, quantity, type) "
    . "VALUES (?, ?, ?, 'SALE')"
  );

  $remaining = $qtyToSell;
  $consumed = [];

  foreach ($fifoLots as $row) {
    if ($remaining <= 0) break;
    $lotId = (int)$row['lot_id'];
    $available = (int)$row['stock'];
    if ($available <= 0) continue;

    $take = min($available, $remaining);
    $stmtIns->execute([$product_id, $lotId, $take]);
    $consumed[] = [
      'lot_id' => $lotId,
      'lot_number' => $row['lot_number'],
      'taken' => $take,
      'expiration_date' => $row['expiration_date'],
      'production_date' => $row['production_date'],
    ];
    $remaining -= $take;
  }

  $pdo->commit();

  // stock prodotto dopo vendita
  $stmt2 = $pdo->prepare(
    "SELECT COALESCE(SUM(CASE "
    . "WHEN type='PRODUCTION' THEN quantity "
    . "WHEN type='SALE' THEN -quantity "
    . "WHEN type='ADJUSTMENT' THEN quantity "
    . "ELSE 0 END), 0) AS stock "
    . "FROM movements WHERE product_id = ?"
  );
  $stmt2->execute([$product_id]);
  $remainingProductStock = (int)($stmt2->fetchColumn() ?? 0);

  json_out([
    'success' => true,
    'sold' => $qtyToSell,
    'remaining_product_stock' => $remainingProductStock,
    'fifo_consumed' => $consumed,
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }
  json_out([
    'success' => false,
    'error' => 'Errore server',
    'detail' => $e->getMessage(),
  ], 500);
}