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

  // ------------------------------------------------------------
  // BUGFIX SCADENZE:
  // La logica FEFO esclude i lotti scaduti. Se tutto lo stock è scaduto,
  // prima risultava "stock insufficiente" (0) anche se a magazzino c'è.
  // Qui calcoliamo anche stock totale + stock scaduto per dare un errore chiaro.
  // ------------------------------------------------------------

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
  foreach ($lotsAll as $r) {
    $st = (int)$r['stock'];
    $totalAll += $st;

    $exp = $r['expiration_date'] ? DateTimeImmutable::createFromFormat('Y-m-d', substr((string)$r['expiration_date'],0,10)) : null;
    $isExpired = ($exp !== null && $exp < $today);
    if ($isExpired) {
      $expiredAll += $st;
      $expiredLotsAll[] = [
        'lot_id' => (int)$r['lot_id'],
        'lot_number' => $r['lot_number'],
        'expiration_date' => $r['expiration_date'],
        'production_date' => $r['production_date'],
        'stock' => $st,
      ];
    }
  }

  // Lotti disponibili (stock > 0) ordinati FEFO
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
  ");
  $stmt->execute([$product_id]);
  $lots = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // helper: mappa stock
  $stockByLot = [];
  foreach ($lots as $r) $stockByLot[(int)$r['lot_id']] = (int)$r['stock'];

  // Suggerimenti chip = lotti con stock, FEFO
  $suggested = array_map(fn($r) => [
    'lot_id' => (int)$r['lot_id'],
    'lot_number' => $r['lot_number'],
    'expiration_date' => $r['expiration_date'],
    'production_date' => $r['production_date'],
    'stock' => (int)$r['stock'],
  ], $lots);

  // map su tutti i lotti (inclusi scaduti) per distinguere errori in manuale
  $stockByLotAll = [];
  $expiredByLot = [];
  foreach ($lotsAll as $r) {
    $lid = (int)$r['lot_id'];
    $stockByLotAll[$lid] = (int)$r['stock'];
    $exp = $r['expiration_date'] ? DateTimeImmutable::createFromFormat('Y-m-d', substr((string)$r['expiration_date'],0,10)) : null;
    $expiredByLot[$lid] = ($exp !== null && $exp < $today);
  }

  if ($mode === 'manual') {
    // Validazione input manuale: costruisci plan dai lots richiesti
    $plan = [];
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
      json_out([
        'success'=>false,
        'code'=>'MANUAL_SUM_MISMATCH',
        'error'=>'In manuale la somma dei lotti deve essere uguale alla quantità richiesta',
        'requested'=>$qty,
        'sum'=>$sum,
        'suggested_lots'=>$suggested
      ], 409);
    }

    // Controllo stock per ogni lotto selezionato
    foreach ($plan as $row) {
      $lot_id = (int)$row['lot_id'];
      $need = (int)$row['qty'];
      $avail = $stockByLot[$lot_id] ?? 0;

      // lotto esiste ma è scaduto => blocca con messaggio esplicito
      if (($avail <= 0) && (($stockByLotAll[$lot_id] ?? 0) > 0) && (($expiredByLot[$lot_id] ?? false) === true)) {
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
        // suggerisci altri lotti (escludi quelli già scelti)
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

    json_out([
      'success'=>true,
      'mode'=>'manual',
      'product_id'=>$product_id,
      'quantity'=>$qty,
      'plan'=>$plan,
      'suggested_lots'=>$suggested
    ]);
  }

  // mode auto: crea plan FEFO automatico
  $totalAvailable = 0;
  foreach ($lots as $r) $totalAvailable += (int)$r['stock'];

  if ($totalAvailable < $qty) {
    // Se lo stock totale (incluso scaduto) copre, ma quello vendibile no: è tutto scaduto
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
  $plan = [];
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

  json_out([
    'success'=>true,
    'mode'=>'auto',
    'product_id'=>$product_id,
    'quantity'=>$qty,
    'total_available'=>$totalAvailable,
    'plan'=>$plan,
    'suggested_lots'=>$suggested
  ]);

} catch (Throwable $e) {
  json_out(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}