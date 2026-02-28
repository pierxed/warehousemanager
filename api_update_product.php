<?php
header('Content-Type: application/json');
include 'db.php';

$data = json_decode(file_get_contents("php://input"), true);

$id = (int)($data['id'] ?? 0);
$name = $data['name'] ?? '';
$format = $data['format'] ?? '';
$units = (int)($data['units'] ?? 0);

if(!$id || !$name || !$format || $units<=0){
  echo json_encode(['error'=>'Dati non validi']);
  exit;
}

$stmt = $pdo->prepare("
UPDATE products 
SET name=?, format=?, units_per_tray=? 
WHERE id=?
");
$stmt->execute([$name,$format,$units,$id]);

echo json_encode(['success'=>true]);