<?php
// exports/api_export_movements.php
// CSV export: movimenti + info prodotto/lotto

require_once __DIR__ . '/../api_bootstrap.php';

// Basic filename with local date
$fname = 'movimenti_' . date('Y-m-d') . '.csv';

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

// UTF-8 BOM (Excel friendly)
fprintf($out, "\xEF\xBB\xBF");

// Header
fputcsv($out, [
  'Data',
  'Tipo',
  'Prodotto',
  'Formato',
  'Tipo pesce',
  'EAN',
  'Lotto',
  'Produzione',
  'Scadenza',
  'Quantità',
  'Motivo',
  'Nota',
  'movement_id',
  'product_id',
  'lot_id'
], ';');

$sql = "
  SELECT
    m.id            AS movement_id,
    m.created_at    AS created_at,
    m.type          AS type,
    m.quantity      AS quantity,
    m.reason        AS reason,
    m.note          AS note,

    p.id            AS product_id,
    p.name          AS product_name,
    p.format        AS format,
    p.fish_type     AS fish_type,
    p.ean           AS ean,

    l.id            AS lot_id,
    b.lot_number    AS lot_number,
    b.production_date AS production_date,
    b.expiration_date AS expiration_date
  FROM movements m
  LEFT JOIN products p ON p.id = m.product_id
  LEFT JOIN lots l ON l.id = m.lot_id
  LEFT JOIN batches b ON b.id = l.batch_id
  ORDER BY m.created_at DESC, m.id DESC
";

$stmt = $pdo->query($sql);
while($row = $stmt->fetch(PDO::FETCH_ASSOC)){
  fputcsv($out, [
    $row['created_at'] ?? '',
    $row['type'] ?? '',
    $row['product_name'] ?? '',
    $row['format'] ?? '',
    $row['fish_type'] ?? '',
    $row['ean'] ?? '',
    $row['lot_number'] ?? '',
    $row['production_date'] ?? '',
    $row['expiration_date'] ?? '',
    $row['quantity'] ?? '',
    $row['reason'] ?? '',
    $row['note'] ?? '',
    $row['movement_id'] ?? '',
    $row['product_id'] ?? '',
    $row['lot_id'] ?? ''
  ], ';');
}

fclose($out);
exit;
