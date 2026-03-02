
(function(){
  'use strict';

  const $ = (id)=>document.getElementById(id);

  function setMsg(el, text, cls='muted'){
    if(!el) return;
    el.className = cls;
    el.innerHTML = text;
  }

  function activateTab(tabId){
    const target = $(tabId);
    if(!target) return;

    // deactivate all tabs
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    target.classList.add('active');
    localStorage.setItem('wm_last_tab', tabId);

    // Update sidebar button state if a button exists
    document.querySelectorAll('.tab-btn').forEach(b=>{
      if(b.dataset.target === tabId) b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch(e){ /* ignore */ }
    if(!res.ok){
      const msg = data?.error || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  function bytesToHuman(n){
    const units = ['B','KB','MB','GB'];
    let i=0, v=n;
    while(v>=1024 && i<units.length-1){ v/=1024; i++; }
    return (i===0? v : v.toFixed(1)) + ' ' + units[i];
  }

  function includesLabel(includes){
    if(!includes) return '-';
    const parts=[];
    if(includes.db) parts.push('DB');
    if(includes.uploads) parts.push('Uploads');
    return parts.join(' + ') || '-';
  }

  async function listBackups(){
    const body = $('backup_table_body');
    const msg = $('backup_manager_message');
    try{
      setMsg(msg, 'Caricamento…');
      const res = await fetchJSON('backup/api/list.php');
      const backups = res?.backups || [];
      if(!body) return;

      if(backups.length===0){
        body.innerHTML = '<tr><td class="muted" colspan="5">Nessun backup</td></tr>';
        setMsg(msg, 'Nessun backup trovato', 'muted');
        return;
      }

      body.innerHTML = backups.map(b=>{
        const dt = (b.created_at || '').replace('T',' ').replace('Z','');
        const kind = b.kind || 'manual';
        const size = bytesToHuman(b.size || 0);
        const inc = includesLabel(b.includes);
        const name = b.name;
        const dl = 'backup/api/download.php?name=' + encodeURIComponent(name);
        return `
          <tr>
            <td>${dt}</td>
            <td>${kind}</td>
            <td>${size}</td>
            <td>${inc}</td>
            <td>
              <a class="btn" href="${dl}">Scarica</a>
              <button class="btn danger" data-del="${name}" type="button">Elimina</button>
            </td>
          </tr>
        `;
      }).join('');

      setMsg(msg, 'Lista aggiornata', 'muted');

      // bind delete
      body.querySelectorAll('button[data-del]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const name = btn.dataset.del;
          if(!confirm('Eliminare il backup ' + name + '?')) return;
          try{
            setMsg(msg, 'Eliminazione…');
            await fetchJSON('backup/api/delete.php', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ name })
            });
            await listBackups();
          }catch(e){
            setMsg(msg, e.message || 'Errore eliminazione', 'message error');
          }
        });
      });

    }catch(e){
      if(body) body.innerHTML = '<tr><td class="muted" colspan="5">Errore nel caricamento</td></tr>';
      setMsg(msg, e.message || 'Errore', 'message error');
    }
  }

  async function createBackup(kind='manual'){
    const msg = $('backup_manager_message');
    try{
      setMsg(msg, 'Creazione backup…');
      // include uploads from current settings checkbox if exists, else server setting will be used
      const includeUploads = $('set_backup_include_uploads')?.checked;
      const res = await fetchJSON('backup/api/create.php', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ kind, include_uploads: includeUploads })
      });
      const url = res?.download_url || '';
      const name = res?.backup?.name || 'backup';
      setMsg(msg, `Backup creato: <a href="${url}" class="link">${name}</a>`, 'message success');
      await listBackups();
      return res;
    }catch(e){
      setMsg(msg, e.message || 'Errore creazione', 'message error');
      throw e;
    }
  }

  // Settings page buttons
  function bindSettingsButtons(){
    $('btn_backup_manage')?.addEventListener('click', ()=>{
      activateTab('tab_backup_manager');
      listBackups();
    });

    $('btn_backup_run_now')?.addEventListener('click', async ()=>{
      const msg = $('backup_run_message');
      try{
        if(msg) msg.textContent = 'Creazione backup…';
        const includeUploads = $('set_backup_include_uploads')?.checked;
        const res = await fetchJSON('backup/api/create.php', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ kind:'manual', include_uploads: includeUploads })
        });
        const url = res?.download_url || '';
        const name = res?.backup?.name || 'backup';
        if(msg) msg.innerHTML = `Backup creato: <a href="${url}">${name}</a>`;
      }catch(e){
        if(msg) msg.textContent = e.message || 'Errore backup';
      }
    });
  }

  function bindManagerButtons(){
    $('btn_backup_refresh')?.addEventListener('click', listBackups);
    $('btn_backup_create_now')?.addEventListener('click', ()=>createBackup('manual'));
    $('btn_backup_back_to_settings')?.addEventListener('click', ()=>{
      activateTab('tab_settings');
    });
  }

  // Init when DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{
    bindSettingsButtons();
    bindManagerButtons();
  });

  // Expose minimal API for other modules (optional)
  window.BackupManager = {
    refresh: listBackups,
    open: ()=>{ activateTab('tab_backup_manager'); listBackups(); }
  };
})();
