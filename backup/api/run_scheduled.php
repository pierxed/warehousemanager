<?php
require_once __DIR__ . '/_common.php';

// Can be called via cron or opportunistically (pseudo-cron).
try {
  $settings = load_settings($pdo);
  if(!$settings['backup_enabled']) {
    json_out(['success'=>true,'skipped'=>true,'reason'=>'disabled']);
  }

  $freq = $settings['backup_frequency'];
  if($freq === 'off'){
    json_out(['success'=>true,'skipped'=>true,'reason'=>'frequency_off']);
  }

  $dir = ensure_backups_dir();
  $entries = list_backup_entries($dir);

  $lastAuto = null;
  foreach($entries as $e){
    if(($e['kind'] ?? '') === 'auto'){
      $lastAuto = $e;
      break;
    }
  }

  $now = new DateTime('now');
  $today = $now->format('Y-m-d');
  $time = $settings['backup_time'];
  $targetToday = new DateTime($today . ' ' . $time);

  $due = false;
  if($lastAuto === null){
    $due = ($now >= $targetToday);
  } else {
    $lastDt = new DateTime($lastAuto['created_at']);

    if($freq === 'daily'){
      $due = ($now >= $targetToday) && ($lastDt < $targetToday);
    } elseif($freq === 'weekly'){
      $interval = $lastDt->diff($now)->days;
      $due = ($now >= $targetToday) && ($interval >= 7);
    } elseif($freq === 'monthly'){
      $due = ($now >= $targetToday) && ($lastDt->format('Y-m') !== $now->format('Y-m'));
    }
  }

  if(!$due){
    json_out(['success'=>true,'skipped'=>true,'reason'=>'not_due']);
  }

  $r = create_backup($pdo, $settings, 'auto', null);

  json_out([
    'success'=>true,
    'ran'=>true,
    'backup'=>[
      'name'=>$r['zipName'],
      'created_at'=>$r['manifest']['created_at'],
      'size'=>filesize($r['zipPath']),
      'kind'=>'auto',
    ],
    'download_url'=>'backup/api/download.php?name=' . urlencode($r['zipName']),
    'deleted'=>$r['deleted'],
  ]);

} catch(Throwable $e){
  error_response('Errore scheduler: ' . $e->getMessage(), 500);
}
