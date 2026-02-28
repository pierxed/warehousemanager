<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
    require_method('POST');

    // Leggi input tollerante (JSON o form)
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) $data = [];

    $product_id =
        int_in($data, 'product_id', 0)
        ?: int_in($data, 'id', 0)
        ?: int_in($_POST, 'product_id', 0)
        ?: int_in($_POST, 'id', 0)
        ?: int_in($_GET, 'product_id', 0)
        ?: int_in($_GET, 'id', 0);

    if ($product_id <= 0) {
        json_out(['success'=>false,'error'=>'product_id mancante o non valido'], 400);
    }

    // 1) Verifica che il prodotto esista (questa è la cosa importante)
    $stmt = $pdo->prepare("SELECT id, is_active FROM products WHERE id = ?");
    $stmt->execute([$product_id]);
    $prod = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$prod) {
        json_out(['success'=>false,'error'=>'Prodotto non trovato'], 404);
    }

    // 2) Ha storia?
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM lots WHERE product_id = ?");
    $stmt->execute([$product_id]);
    $has_history = ((int)$stmt->fetchColumn() > 0);

    if ($has_history) {
        // SOFT DELETE: anche se già is_active=0, deve essere "ok"
        if ((int)$prod['is_active'] !== 0) {
            $stmt = $pdo->prepare("UPDATE products SET is_active = 0 WHERE id = ?");
            $stmt->execute([$product_id]);
        }

        json_out(['success'=>true,'mode'=>'soft']);
    } else {
        // HARD DELETE
        $stmt = $pdo->prepare("DELETE FROM products WHERE id = ?");
        $stmt->execute([$product_id]);

        json_out(['success'=>true,'mode'=>'hard']);
    }

} catch (Throwable $e) {
    json_out(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}