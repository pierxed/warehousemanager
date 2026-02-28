<?php
header('Content-Type: application/json');
require 'db.php';

$lot_number = $_GET['lot_number'] ?? '';

if(!$lot_number){
    echo json_encode(['exists'=>false]);
    exit;
}

$stmt = $pdo->prepare("
    SELECT id, fish_type, production_date, expiration_date
    FROM batches
    WHERE lot_number = ?
");
$stmt->execute([$lot_number]);
$batch = $stmt->fetch(PDO::FETCH_ASSOC);

if(!$batch){
    echo json_encode(['exists'=>false]);
    exit;
}

echo json_encode([
    'exists'=>true,
    'batch_id'=>$batch['id'],
    'fish_type'=>$batch['fish_type'],
    'production_date'=>$batch['production_date'],
    'expiration_date'=>$batch['expiration_date']
]);