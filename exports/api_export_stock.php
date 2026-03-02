<?php
// exports/api_export_stock.php
// CSV export: stock per prodotto + stock scaduto

require_once __DIR__ . '/../api_bootstrap.php';

$fname = 'stock_totale_' . date('Y-m-d') . '.csv';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fname . '"');
header('Pragma: no-cache');
header('Expires: 0');

$out = fopen('php://output', 'w');
if(!$out){
  http_response_code(500);
  echo "Impossibile creare output";
  exit;
}

fprintf($out, "\xEF\xBB\xBF");

fputcsv($out, [
  'Tipo pesce',
  'Prodotto',
  'Formato',
  'EAN',
  'Stock totale',
  'Stock scaduto',
  'Attivo',
  'product_id'
], ';');

$sql = "
  SELECT
    p.id,
    p.fish_type,
    p.name,
    p.format,
    p.ean,
    p.is_active,
    COALESCE(SUM(
      CASE
        WHEN m.type = 'PRODUCTION' THEN m.quantity
        WHEN m.type = 'SALE' THEN -m.quantity
        WHEN m.type = 'ADJUSTMENT' THEN m.quantity
        ELSE 0
      END
    ), 0) AS stock,
    COALESCE(SUM(
      CASE
        WHEN (b.expiration_date IS NOT NULL AND b.expiration_date < CURDATE()) THEN
          CASE
            WHEN m.type = 'PRODUCTION' THEN m.quantity
            WHEN m.type = 'SALE' THEN -m.quantity
            WHEN m.type = 'ADJUSTMENT' THEN m.quantity
            ELSE 0
          END
        ELSE 0
      END
    ), 0) AS expired_stock
  FROM products p
  LEFT JOIN lots l
    ON l.product_id = p.id
  LEFT JOIN batches b
    ON b.id = l.batch_id
  LEFT JOIN movements m
    ON m.lot_id = l.id
  GROUP BY
    p.id, p.fish_type, p.name, p.format, p.ean, p.is_active
  ORDER BY
    p.fish_type ASC, p.name ASC, p.format ASC
";

$stmt = $pdo->query($sql);
while($r = $stmt->fetch(PDO::FETCH_ASSOC)){
  fputcsv($out, [
    $r['fish_type'] ?? '',
    $r['name'] ?? '',
    $r['format'] ?? '',
    $r['ean'] ?? '',
    $r['stock'] ?? 0,
    $r['expired_stock'] ?? 0,
    (string)($r['is_active'] ?? ''),
    $r['id'] ?? ''
  ], ';');
}

fclose($out);
exit;
