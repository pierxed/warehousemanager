<?php
header('Content-Type: application/json');
error_reporting(0);
include 'db.php';

$ean = $_GET['ean'] ?? '';
$ean = trim($ean);

if($ean === ''){
  echo json_encode(['error'=>'EAN mancante']);
  exit;
}

$stmt = $pdo->prepare("SELECT id, name, ean, units_per_tray FROM products WHERE ean = ?");
$stmt->execute([$ean]);
$p = $stmt->fetch();

if(!$p){
  echo json_encode(['error'=>'Prodotto non trovato']);
  exit;
}

echo json_encode([
  'id' => (int)$p['id'],
  'name' => $p['name'],
  'ean' => $p['ean'],
  'units_per_tray' => (int)$p['units_per_tray']
]);