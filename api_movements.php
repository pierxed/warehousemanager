<?php
header('Content-Type: application/json');
error_reporting(0);
include 'db.php';

$stmt = $pdo->query("
  SELECT id, product_id, lot_id, quantity, type, created_at
  FROM movements
  ORDER BY created_at ASC
");

echo json_encode($stmt->fetchAll() ?: []);