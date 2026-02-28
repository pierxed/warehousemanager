<?php
header('Content-Type: application/json');
error_reporting(0);
include 'db.php';

$stmt = $pdo->query("
  SELECT id, name, format, fish_type, ean, units_per_tray
  FROM products
");
echo json_encode($stmt->fetchAll() ?: []);