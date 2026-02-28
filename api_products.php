<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {

    require_method('GET');

    $stmt = $pdo->query("
        SELECT id, name, format, fish_type, ean, units_per_tray
        FROM products
        WHERE is_active = 1
        ORDER BY name
    ");

    json_response($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []);

} catch (Throwable $e) {
    json_response([
        'success' => false,
        'error' => 'Errore server',
        'detail' => $e->getMessage()
    ], 500);
}