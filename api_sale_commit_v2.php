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

  // Calcola stock totale + stock scaduto (serve a dare un errore chiaro quando è tutto scaduto)
  $stmtAll = $pdo->prepare("
    SELECT
      l.id AS lot_id,
      b.lot_number,
      b.expiration_date,
      b.production_date,
      COALESCE(SUM(CASE
        WHEN m.type='PRODUCTION' THEN m.quantity
        WHEN m.type='SALE' THEN -m.quantity
        WHEN m.type='ADJUSTMENT' THEN m.quantity
        ELSE 0
      END), 0) AS stock
    FROM lots l
    JOIN batches b ON b.id = l.batch_id
    LEFT JOIN movements m ON m.lot_id = l.id
    WHERE l.product_id = ?
    GROUP BY l.id, b.lot_number, b.expiration_date, b.production_date
    HAVING stock > 0
    ORDER BY b.expiration_date ASC, b.production_date ASC, l.id ASC
  ");
  $stmtAll->execute([$product_id]);
  $lotsAll = $stmtAll->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $today = new DateTimeImmutable('today');
  $expiredLotsAll = [];
  $totalAll = 0;
  $expiredAll = 0;
  $stockByLotAll = [];
  $expiredByLot = [];
  foreach ($lotsAll as $r) {
    $lid = (int)$r['lot_id'];
    $st = (int)$r['stock'];
    $totalAll += $st;
    $stockByLotAll[$lid] = $st;
    $exp = $r['expiration_date'] ? DateTimeImmutable::createFromFormat('Y-m-d', substr((string)$r['expiration_date'],0,10)) : null;
    $isExpired = ($exp !== null && $exp < $today);
    $expiredByLot[$lid] = $isExpired;
    if ($isExpired) {
      $expiredAll += $st;
      $expiredLotsAll[] = [
        'lot_id' => $lid,
        'lot_number' => $r['lot_number'],
        'expiration_date' => $r['expiration_date'],
        'production_date' => $r['production_date'],
        'stock' => $st,
      ];
    }
  }

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
        WHEN m.type='ADJUSTMENT' THEN m.quantity
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

      // lotto esiste ma è scaduto => blocca con messaggio esplicito
      if (($avail <= 0) && (($stockByLotAll[$lot_id] ?? 0) > 0) && (($expiredByLot[$lot_id] ?? false) === true)) {
        $pdo->rollBack();
        json_out([
          'success'=>false,
          'code'=>'LOT_EXPIRED',
          'error'=>'Lotto scaduto: vendita bloccata',
          'lot_id'=>$lot_id,
          'expired_available'=>$stockByLotAll[$lot_id],
          'suggested_lots'=>$suggested,
          'expired_lots'=>$expiredLotsAll
        ], 409);
      }
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

      if ($totalAll >= $qty && $expiredAll > 0) {
        json_out([
          'success'=>false,
          'code'=>'EXPIRED_STOCK_BLOCKED',
          'error'=>'Stock presente ma scaduto: vendita bloccata',
          'available_non_expired'=>$totalAvailable,
          'available_total'=>$totalAll,
          'expired_available'=>$expiredAll,
          'requested'=>$qty,
          'suggested_lots'=>$suggested,
          'expired_lots'=>$expiredLotsAll
        ], 409);
      }

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