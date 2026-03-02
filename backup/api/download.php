<?php
require_once __DIR__ . '/_common.php';

$name = sanitize_backup_name((string)($_GET['name'] ?? ''));
if($name === '' || !preg_match('/\.zip$/', $name)){
  error_response('Nome backup non valido', 400);
}

$dir = ensure_backups_dir();
$path = realpath($dir . '/' . $name);
if(!$path || strpos($path, realpath($dir)) !== 0 || !is_file($path)){
  error_response('Backup non trovato', 404);
}

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . basename($path) . '"');
header('Content-Length: ' . filesize($path));
readfile($path);
exit;
