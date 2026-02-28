<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
    require_method('POST');

    // Body JSON
    $data = read_json_body(); // alias -> get_json_input()

    // Input (corretto: *_in(array, key, default))
    $product_id      = int_in($data, 'product_id', 0);
    $lot_number      = str_in($data, 'lot_number', '');
    $expiration_date = str_in($data, 'expiration_date', '');
    $quantity_input  = int_in($data, 'quantity_input', 0);
    $quantity_type   = str_in($data, 'quantity_type', 'units'); // 'units' | 'trays'

    if ($product_id <= 0 || $lot_number === '' || $quantity_input <= 0) {
        json_out(['success' => false, 'error' => 'Dati mancanti'], 400);
    }

    $pdo->beginTransaction();

    // 1) PRENDO PRODOTTO (lock)
    $stmt = $pdo->prepare("SELECT fish_type, units_per_tray FROM products WHERE id = ? FOR UPDATE");
    $stmt->execute([$product_id]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$product) {
        $pdo->rollBack();
        json_out(['success' => false, 'error' => 'Prodotto non trovato'], 404);
    }

    $fish_type = (string)$product['fish_type'];
    $units_per_tray = (int)$product['units_per_tray'];

    // 2) CALCOLO QUANTITÀ FINALE
    if ($quantity_type === 'trays') {
        if ($units_per_tray <= 0) {
            $pdo->rollBack();
            json_out(['success' => false, 'error' => 'units_per_tray non valido per questo prodotto'], 422);
        }
        $final_quantity = $quantity_input * $units_per_tray;
    } else {
        $final_quantity = $quantity_input;
    }

    // 3) CERCO / CREO BATCH (lock)
    $stmt = $pdo->prepare("SELECT id, fish_type, lot_number, production_date, expiration_date FROM batches WHERE lot_number = ? FOR UPDATE");
    $stmt->execute([$lot_number]);
    $batch = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($batch) {
        // fish type coerente
        if ((string)$batch['fish_type'] !== $fish_type) {
            $pdo->rollBack();
            json_out([
                'success' => false,
                'error' => 'Fish type diverso',
                'detail' => 'Questo lotto appartiene a ' . (string)$batch['fish_type'],
            ], 409);
        }

        $batch_id = (int)$batch['id'];
        $batch_reused = true;
    } else {
        // nuovo lotto => scadenza obbligatoria
        if ($expiration_date === '') {
            $pdo->rollBack();
            json_out(['success' => false, 'error' => 'Inserisci la scadenza per nuovo lotto'], 400);
        }

        $stmt = $pdo->prepare("
            INSERT INTO batches (fish_type, lot_number, production_date, expiration_date)
            VALUES (?, ?, CURDATE(), ?)
        ");
        $stmt->execute([$fish_type, $lot_number, $expiration_date]);

        $batch_id = (int)$pdo->lastInsertId();
        $batch_reused = false;
    }

    // 4) CERCO / CREO LOT dentro quel batch (lock)
    $stmt = $pdo->prepare("
        SELECT id FROM lots
        WHERE product_id = ? AND batch_id = ?
        FOR UPDATE
    ");
    $stmt->execute([$product_id, $batch_id]);
    $lot = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($lot) {
        $lot_id = (int)$lot['id'];
    } else {
        $stmt = $pdo->prepare("
            INSERT INTO lots (product_id, batch_id)
            VALUES (?, ?)
        ");
        $stmt->execute([$product_id, $batch_id]);
        $lot_id = (int)$pdo->lastInsertId();
    }

    // 5) MOVEMENT PRODUCTION
    $stmt = $pdo->prepare("
        INSERT INTO movements (product_id, lot_id, quantity, type)
        VALUES (?, ?, ?, 'PRODUCTION')
    ");
    $stmt->execute([$product_id, $lot_id, $final_quantity]);

    $pdo->commit();

    json_out([
        'success' => true,
        'quantity' => $final_quantity,
        'lot_number' => $lot_number,
        'batch_reused' => $batch_reused
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_out([
        'success' => false,
        'error' => 'Errore server',
        'detail' => $e->getMessage()
    ], 500);
}