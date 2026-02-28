<?php
require_once __DIR__ . '/api_bootstrap.php';
require_once __DIR__ . '/db.php';

try {
  // Parametri filtro (opzionali)
  $days = int_in($_GET, 'days', 0); // 0 = nessun filtro
  if ($days !== null && $days < 0) $days = 0;

  // 1) Lotti + stock per lotto (con join prodotto/batch)
  $sqlLots = "
    SELECT
      l.id AS lot_id,
      p.id AS product_id,
      p.name AS product_name,
      p.format,
      p.fish_type,
      p.ean,
      b.lot_number,
      b.production_date,
      b.expiration_date,
      COALESCE(SUM(
        CASE
          WHEN m.type='PRODUCTION' THEN m.quantity
          WHEN m.type='SALE' THEN -m.quantity
          WHEN m.type='ADJUSTMENT' THEN m.quantity
          ELSE 0
        END
      ), 0) AS stock
    FROM lots l
    JOIN products p ON p.id = l.product_id
    JOIN batches b ON b.id = l.batch_id
    LEFT JOIN movements m ON m.lot_id = l.id
    GROUP BY
      l.id, p.id, p.name, p.format, p.fish_type, p.ean,
      b.lot_number, b.production_date, b.expiration_date
    HAVING stock <> 0
    ORDER BY b.expiration_date ASC, b.production_date ASC, l.id ASC
  ";
  $stmt = $pdo->query($sqlLots);
  $lots = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // filtro scadenza (se richiesto) lato PHP per semplicità e zero sorprese SQL
  if ($days && $days > 0) {
    $today = new DateTimeImmutable('today');
    $lots = array_values(array_filter($lots, function($r) use ($today, $days){
      if (empty($r['expiration_date'])) return false;
      $exp = DateTimeImmutable::createFromFormat('Y-m-d', substr($r['expiration_date'],0,10));
      if (!$exp) return false;
      $diff = (int)$today->diff($exp)->format('%r%a');
      return $diff >= 0 && $diff <= $days;
    }));
  }

  // 2) Aggregato per prodotto + FEFO (lotto con scadenza più vicina)
  $byProduct = [];
  foreach ($lots as $r) {
    $pid = (int)$r['product_id'];
    if (!isset($byProduct[$pid])) {
      $byProduct[$pid] = [
        'product_id' => $pid,
        'product_name' => $r['product_name'],
        'format' => $r['format'],
        'fish_type' => $r['fish_type'],
        'ean' => $r['ean'],
        'stock_total' => 0,
        'lots_count' => 0,
        'fefo_lot_number' => null,
        'fefo_expiration_date' => null,
        'fefo_lot_id' => null,
      ];
    }
    $stock = (int)$r['stock'];
    $byProduct[$pid]['stock_total'] += $stock;
    $byProduct[$pid]['lots_count'] += 1;

    // FEFO = scadenza più vicina (solo se scadenza esiste e stock > 0)
    if (!empty($r['expiration_date']) && $stock > 0) {
      $curr = $byProduct[$pid]['fefo_expiration_date'];
      if ($curr === null || $r['expiration_date'] < $curr) {
        $byProduct[$pid]['fefo_expiration_date'] = $r['expiration_date'];
        $byProduct[$pid]['fefo_lot_number'] = $r['lot_number'];
        $byProduct[$pid]['fefo_lot_id'] = (int)$r['lot_id'];
      }
    }
  }
  $productsAgg = array_values($byProduct);
  usort($productsAgg, fn($a,$b) => ($b['stock_total'] <=> $a['stock_total']));

  // 3) Movimenti recenti (ultimi 20)
  $stmtM = $pdo->query("
    SELECT id, product_id, lot_id, quantity, type, reason, note, created_at
    FROM movements
    ORDER BY created_at DESC
    LIMIT 20
  ");
  $recentMovements = $stmtM->fetchAll(PDO::FETCH_ASSOC) ?: [];

  json_out([
    'success' => true,
    'products_agg' => $productsAgg,
    'lots_view' => $lots,
    'recent_movements' => $recentMovements,
  ]);
} catch (Throwable $e) {
  json_out(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}