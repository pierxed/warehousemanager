<?php
header('Content-Type: application/json');
include 'db.php';

$data = json_decode(file_get_contents("php://input"), true);
$id = (int)($data['id'] ?? 0);

if(!$id){
  echo json_encode(['error'=>'ID non valido']);
  exit;
}

$stmt = $pdo->prepare("DELETE FROM products WHERE id=?");
$stmt->execute([$id]);

echo json_encode(['success'=>true]);