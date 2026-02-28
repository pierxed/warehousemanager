<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
    require_method('GET');

    $stmt = $pdo->query("
        SELECT
            p.id,
            p.name,
            p.format,
            p.fish_type,
            p.ean,
            p.units_per_tray,
            p.image_path,
            COALESCE(SUM(
                CASE
                    WHEN m.type = 'PRODUCTION' THEN m.quantity
                    WHEN m.type = 'SALE' THEN -m.quantity
                    WHEN m.type = 'ADJUSTMENT' THEN m.quantity
                    ELSE 0
                END
            ), 0) AS stock
        FROM products p
        LEFT JOIN lots l ON l.product_id = p.id
        LEFT JOIN movements m ON m.lot_id = l.id
        WHERE p.is_active = 1
        GROUP BY
            p.id, p.name, p.format, p.fish_type, p.ean, p.units_per_tray, p.image_path
        ORDER BY p.name
    ");

    $products = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // cast coerenti
    foreach ($products as &$p) {
        $p['id'] = (int)$p['id'];
        $p['units_per_tray'] = (int)$p['units_per_tray'];
        $p['stock'] = (int)$p['stock'];
    }

    json_response($products);

} catch (Throwable $e) {
    json_response(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}