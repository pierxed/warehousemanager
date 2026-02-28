<?php
header('Content-Type: application/json');
require_once __DIR__ . '/api_bootstrap.php';

$stmt = $pdo->query("
    SELECT 
        l.id as lot_id,
        p.id as product_id,
        p.name as product_name,
        p.format,
        p.fish_type,
        p.ean,
        b.lot_number,
        b.production_date,
        b.expiration_date
    FROM lots l
    JOIN products p ON l.product_id = p.id
    JOIN batches b ON l.batch_id = b.id
    ORDER BY b.expiration_date ASC
");

echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));