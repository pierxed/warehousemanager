<?php
// api_products_with_stock.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db.php'; // <-- assicurati che qui dentro ci sia $pdo (PDO)

try {
    // Stock per prodotto = somma movimenti su tutti i lotti del prodotto:
    // PRODUCTION: +qty
    // SALE: -qty
    // ADJUSTMENT: +qty (può essere anche negativa già di suo)
    //
    // FIX IMPORTANTISSIMO:
    // movements.lot_id deve joinare lots.id (NON lots.lot_id)

    $sql = "
      SELECT
        p.id,
        p.name,
        p.format,
        p.units_per_tray,
        p.ean,
        p.fish_type,
        p.image_path,
        p.is_active,
        COALESCE(SUM(
          CASE
            WHEN m.type = 'PRODUCTION' THEN m.quantity
            WHEN m.type = 'SALE' THEN -m.quantity
            WHEN m.type = 'ADJUSTMENT' THEN m.quantity
            ELSE 0
          END
        ), 0) AS stock
      FROM products p
      LEFT JOIN lots l
        ON l.product_id = p.id
      LEFT JOIN movements m
        ON m.lot_id = l.id
      GROUP BY
        p.id, p.name, p.format, p.units_per_tray, p.ean, p.fish_type, p.image_path, p.is_active
      ORDER BY
        p.name ASC, p.format ASC
    ";

    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => "Errore server",
        "detail" => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}