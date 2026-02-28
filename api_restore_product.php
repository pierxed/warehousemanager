<?php
require 'api_bootstrap.php';

$data = json_decode(file_get_contents("php://input"), true);
$id = intval($data['id'] ?? 0);

if(!$id){
  echo json_encode(['error'=>'ID non valido']);
  exit;
}

$stmt = $pdo->prepare("
  UPDATE products
  SET is_active = 1
  WHERE id = ?
");

$stmt->execute([$id]);

echo json_encode(['success'=>true]);