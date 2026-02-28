<?php
header('Content-Type: application/json');
require 'db.php';

$data = json_decode(file_get_contents("php://input"), true);

$product_id     = (int)($data['product_id'] ?? 0);
$lot_number     = trim($data['lot_number'] ?? '');
$expiration_date= $data['expiration_date'] ?? '';
$quantity_input = (int)($data['quantity_input'] ?? 0);
$quantity_type  = $data['quantity_type'] ?? 'units';

if($product_id <= 0 || !$lot_number || $quantity_input <= 0){
    echo json_encode(['error'=>'Dati mancanti']);
    exit;
}

try{

    // 🔎 PRENDO PRODOTTO
    $stmt = $pdo->prepare("SELECT fish_type, units_per_tray FROM products WHERE id = ?");
    $stmt->execute([$product_id]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);

    if(!$product){
        echo json_encode(['error'=>'Prodotto non trovato']);
        exit;
    }

    $fish_type = $product['fish_type'];
    $units_per_tray = (int)$product['units_per_tray'];

    // 🔢 CALCOLO QUANTITA FINALE
    if($quantity_type === 'trays'){
        $final_quantity = $quantity_input * $units_per_tray;
    } else {
        $final_quantity = $quantity_input;
    }

    // 🔎 CERCO BATCH
    $stmt = $pdo->prepare("SELECT * FROM batches WHERE lot_number = ?");
    $stmt->execute([$lot_number]);
    $batch = $stmt->fetch(PDO::FETCH_ASSOC);

    if($batch){

        // 🚨 CONTROLLO FISH TYPE
        if($batch['fish_type'] !== $fish_type){
            echo json_encode([
                'error' => 'Fish type diverso! Questo lotto appartiene a ' . $batch['fish_type']
            ]);
            exit;
        }

        $batch_id = $batch['id'];
        $batch_reused = true;

    } else {

        if(!$expiration_date){
            echo json_encode(['error'=>'Inserisci la scadenza per nuovo lotto']);
            exit;
        }

        // 🆕 CREO BATCH
        $stmt = $pdo->prepare("
            INSERT INTO batches (fish_type, lot_number, production_date, expiration_date)
            VALUES (?, ?, CURDATE(), ?)
        ");
        $stmt->execute([$fish_type, $lot_number, $expiration_date]);

        $batch_id = $pdo->lastInsertId();
        $batch_reused = false;
    }

    // 🔎 CERCO LOT (formato dentro batch)
    $stmt = $pdo->prepare("
        SELECT id FROM lots 
        WHERE product_id = ? AND batch_id = ?
    ");
    $stmt->execute([$product_id, $batch_id]);
    $lot = $stmt->fetch(PDO::FETCH_ASSOC);

    if($lot){
        $lot_id = $lot['id'];
    } else {
        // 🆕 CREO LOT
        $stmt = $pdo->prepare("
            INSERT INTO lots (product_id, batch_id)
            VALUES (?, ?)
        ");
        $stmt->execute([$product_id, $batch_id]);
        $lot_id = $pdo->lastInsertId();
    }

    // ➕ MOVEMENT
    $stmt = $pdo->prepare("
        INSERT INTO movements (product_id, lot_id, quantity, type)
        VALUES (?, ?, ?, 'PRODUCTION')
    ");
    $stmt->execute([$product_id, $lot_id, $final_quantity]);

    echo json_encode([
        'success'=>true,
        'quantity'=>$final_quantity,
        'lot_number'=>$lot_number,
        'batch_reused'=>$batch_reused
    ]);

}catch(Exception $e){
    echo json_encode(['error'=>$e->getMessage()]);
}