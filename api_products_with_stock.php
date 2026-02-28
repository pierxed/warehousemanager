<?php
header('Content-Type: application/json');
require 'db.php';

$stmt = $pdo->query("
    SELECT 
        p.id,
        p.name,
        p.format,
        p.fish_type,
        p.ean,
        p.units_per_tray,
        p.image_path
    FROM products p
");

$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach($products as &$product){

    $stmtStock = $pdo->prepare("
        SELECT 
            SUM(
                CASE 
                    WHEN m.type='PRODUCTION' THEN m.quantity
                    WHEN m.type='SALE' THEN -m.quantity
                    ELSE 0
                END
            ) as stock
        FROM movements m
        JOIN lots l ON m.lot_id = l.id
        WHERE l.product_id = ?
    ");

    $stmtStock->execute([$product['id']]);
    $row = $stmtStock->fetch(PDO::FETCH_ASSOC);

    $product['stock'] = (int)($row['stock'] ?? 0);
}

echo json_encode($products);