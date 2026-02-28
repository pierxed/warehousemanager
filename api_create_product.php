<?php
header('Content-Type: application/json');
require_once __DIR__ . '/api_bootstrap.php';

$name = $_POST['name'] ?? '';
$format = $_POST['format'] ?? '';
$ean = $_POST['ean'] ?? '';
$units = (int)($_POST['units_per_tray'] ?? 0);
$fish_type = strtoupper(trim($_POST['fish_type'] ?? ''));

if(!$name || !$fish_type || !$format || !$ean || $units <= 0){
    echo json_encode(['error'=>'Dati mancanti']);
    exit;
}

$image_path = null;

if(isset($_FILES['image']) && $_FILES['image']['error'] === 0){

    $uploadDir = 'uploads/';
    if(!is_dir($uploadDir)){
        mkdir($uploadDir, 0777, true);
    }

    $filename = time() . '_' . basename($_FILES['image']['name']);
    $targetFile = $uploadDir . $filename;

    if(move_uploaded_file($_FILES['image']['tmp_name'], $targetFile)){
        $image_path = $targetFile;
    }
}

$stmt = $pdo->prepare("
  INSERT INTO products (name, format, fish_type, ean, units_per_tray, image_path)
  VALUES (?, ?, ?, ?, ?, ?)
");

$stmt->execute([
  $name,
  $format,
  $fish_type,
  $ean,
  $units,
  $image_path
]);


echo json_encode(['success'=>true]);