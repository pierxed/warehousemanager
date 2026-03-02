<?php
require_once __DIR__ . '/_common.php';
require_method('POST');

$input = read_json_body();
$name = sanitize_backup_name((string)($input['name'] ?? ''));
if($name === '' || !preg_match('/\.zip$/', $name)){
  error_response('Nome backup non valido', 400);
}

$dir = ensure_backups_dir();
$zip = $dir . '/' . $name;
$json = $dir . '/' . basename($name, '.zip') . '.json';

$ok = false;
if(is_file($zip)){
  $ok = @unlink($zip);
}
if(is_file($json)){
  @unlink($json);
}

json_out(['success'=>true,'deleted'=>$ok]);
