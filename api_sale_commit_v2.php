<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
  require_method('POST');
  $data = read_json_body();

  $mode = str_in($data, 'mode', 'auto'); // auto | manual
  $product_id = int_in($data, 'product_id', 0);
  $qty = int_in($data, 'quantity', 0);

  if ($product_id <= 0 || $qty <= 0) {
    json_out(['success'=>false,'code'=>'INVALID_INPUT','error'=>'Dati mancanti'], 400);
  }

  $requestedLots = $data['lots'] ?? [];
  if (!is_array($requestedLots)) $requestedLots = [];

  $pdo->beginTransaction();

  // Query FEFO con lock
  $stmt = $pdo->prepare("
    SELECT
      l.id AS lot_id,
      b.lot_number,
      b.expiration_date,
      b.production_date,
      COALESCE(SUM(CASE
        WHEN m.type='PRODUCTION' THEN m.quantity
        WHEN m.type='SALE' THEN -m.quantity
        ELSE 0
      END), 0) AS stock
    FROM lots l
    JOIN batches b ON b.id = l.batch_id
    LEFT JOIN movements m ON m.lot_id = l.id
    WHERE l.product_id = ?
      AND (b.expiration_date IS NULL OR b.expiration_date >= CURDATE())
    GROUP BY l.id, b.lot_number, b.expiration_date, b.production_date
    HAVING stock > 0
    ORDER BY b.expiration_date ASC, b.production_date ASC, l.id ASC
    FOR UPDATE
  ");
  $stmt->execute([$product_id]);
  $lots = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $stockByLot = [];
  foreach ($lots as $r) $stockByLot[(int)$r['lot_id']] = (int)$r['stock'];

  $suggested = array_map(fn($r) => [
    'lot_id' => (int)$r['lot_id'],
    'lot_number' => $r['lot_number'],
    'expiration_date' => $r['expiration_date'],
    'production_date' => $r['production_date'],
    'stock' => (int)$r['stock'],
  ], $lots);

  $plan = [];

  if ($mode === 'manual') {
    $sum = 0;
    foreach ($requestedLots as $x) {
      if (!is_array($x)) continue;
      $lot_id = (int)($x['lot_id'] ?? 0);
      $q = (int)($x['qty'] ?? 0);
      if ($lot_id <= 0 || $q <= 0) continue;
      $plan[] = ['lot_id'=>$lot_id, 'qty'=>$q];
      $sum += $q;
    }

    if ($sum !== $qty) {
      $pdo->rollBack();
      json_out([
        'success'=>false,
        'code'=>'MANUAL_SUM_MISMATCH',
        'error'=>'Somma lotti diversa dalla quantità richiesta',
        'requested'=>$qty,
        'sum'=>$sum,
        'suggested_lots'=>$suggested
      ], 409);
    }

    foreach ($plan as $row) {
      $lot_id = (int)$row['lot_id'];
      $need = (int)$row['qty'];
      $avail = $stockByLot[$lot_id] ?? 0;
      if ($avail < $need) {
        $pdo->rollBack();
        $chosen = array_flip(array_map(fn($p)=> (int)$p['lot_id'], $plan));
        $suggested2 = array_values(array_filter($suggested, fn($s)=> !isset($chosen[(int)$s['lot_id']])));

        json_out([
          'success'=>false,
          'code'=>'INSUFFICIENT_STOCK_LOT',
          'error'=>'Stock insufficiente nel lotto selezionato',
          'lot_id'=>$lot_id,
          'available'=>$avail,
          'requested'=>$need,
          'remaining_needed'=> $need - $avail,
          'suggested_lots'=>$suggested2
        ], 409);
      }
    }
  } else {
    $totalAvailable = 0;
    foreach ($lots as $r) $totalAvailable += (int)$r['stock'];

    if ($totalAvailable < $qty) {
      $pdo->rollBack();
      json_out([
        'success'=>false,
        'code'=>'INSUFFICIENT_STOCK_TOTAL',
        'error'=>'Stock insufficiente',
        'available'=>$totalAvailable,
        'requested'=>$qty,
        'suggested_lots'=>$suggested
      ], 409);
    }

    $remaining = $qty;
    foreach ($lots as $r) {
      if ($remaining <= 0) break;
      $avail = (int)$r['stock'];
      if ($avail <= 0) continue;
      $take = min($avail, $remaining);
      $plan[] = [
        'lot_id'=>(int)$r['lot_id'],
        'lot_number'=>$r['lot_number'],
        'qty'=>$take,
        'expiration_date'=>$r['expiration_date'],
        'production_date'=>$r['production_date'],
      ];
      $remaining -= $take;
    }
  }

  // Inserisci movimenti SALE secondo plan
  $stmtIns = $pdo->prepare("
    INSERT INTO movements (product_id, lot_id, quantity, type)
    VALUES (?, ?, ?, 'SALE')
  ");

  $consumed = [];
  foreach ($plan as $row) {
    $lot_id = (int)$row['lot_id'];
    $q = (int)$row['qty'];
    if ($q <= 0) continue;
    $stmtIns->execute([$product_id, $lot_id, $q]);
    $consumed[] = [
      'lot_id'=>$lot_id,
      'lot_number'=>$row['lot_number'] ?? null,
      'taken'=>$q,
      'expiration_date'=>$row['expiration_date'] ?? null,
      'production_date'=>$row['production_date'] ?? null,
    ];
  }

  $pdo->commit();

  json_out([
    'success'=>true,
    'mode'=>$mode,
    'sold'=>$qty,
    'fifo_consumed'=>$consumed
  ]);

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  json_out(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}