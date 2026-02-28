<?php
require_once __DIR__ . '/api_bootstrap.php';
require_once __DIR__ . '/db.php';

try {
  // 1) Lotti in scadenza (stock > 0) entro 7/14/30
  $stmt = $pdo->query("
    SELECT
      l.id AS lot_id,
      p.name AS product_name,
      p.format,
      p.fish_type,
      p.ean,
      b.lot_number,
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
    WHERE b.expiration_date IS NOT NULL
    GROUP BY l.id, p.name, p.format, p.fish_type, p.ean, b.lot_number, b.expiration_date
    HAVING stock > 0
    ORDER BY b.expiration_date ASC
  ");
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $today = new DateTimeImmutable('today');
  $bucket = fn($maxDays) => array_values(array_filter($rows, function($r) use ($today, $maxDays){
    $exp = DateTimeImmutable::createFromFormat('Y-m-d', substr($r['expiration_date'],0,10));
    if(!$exp) return false;
    $diff = (int)$today->diff($exp)->format('%r%a');
    return $diff >= 0 && $diff <= $maxDays;
  }));

  $exp7  = $bucket(7);
  $exp14 = $bucket(14);
  $exp30 = $bucket(30);

  // 2) Forecast “finirà tra ~N giorni” (media vendite ultimi 14 giorni)
  $stmt2 = $pdo->query("
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.format,
      p.fish_type,
      p.ean,
      COALESCE(SUM(
        CASE
          WHEN m.type='PRODUCTION' THEN m.quantity
          WHEN m.type='SALE' THEN -m.quantity
          WHEN m.type='ADJUSTMENT' THEN m.quantity
          ELSE 0
        END
      ), 0) AS stock_total,
      COALESCE(SUM(
        CASE
          WHEN m.type='SALE' AND m.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) THEN m.quantity
          ELSE 0
        END
      ), 0) AS sold_14d
    FROM products p
    LEFT JOIN movements m ON m.product_id = p.id
    GROUP BY p.id, p.name, p.format, p.fish_type, p.ean
  ");
  $pRows = $stmt2->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $runout = [];
  foreach ($pRows as $r) {
    $stock = (int)$r['stock_total'];
    $sold14 = (int)$r['sold_14d'];
    if ($stock <= 0) continue;
    if ($sold14 <= 0) continue; // se non vende, niente previsione
    $avgDaily = $sold14 / 14.0;
    $daysLeft = (int)ceil($stock / $avgDaily);
    $runout[] = [
      'product_id' => (int)$r['product_id'],
      'product_name' => $r['product_name'],
      'format' => $r['format'],
      'fish_type' => $r['fish_type'],
      'ean' => $r['ean'],
      'stock_total' => $stock,
      'sold_14d' => $sold14,
      'days_left' => $daysLeft,
    ];
  }
  usort($runout, fn($a,$b) => ($a['days_left'] <=> $b['days_left']));
  $runout = array_slice($runout, 0, 10);

  json_out([
    'success' => true,
    'expiring_7d' => $exp7,
    'expiring_14d' => $exp14,
    'expiring_30d' => $exp30,
    'runout_forecast' => $runout,
  ]);
} catch (Throwable $e) {
  json_out(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}