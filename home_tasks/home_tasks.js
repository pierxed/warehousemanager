/* =========================================================
   Warehouse Manager - Home Tasks (v0.5)
   - Isolated module
   - Zero hard dependencies: if missing data/DOM, it safely no-ops
   ========================================================= */

(function(){
  'use strict';

  function safeInt(v, def){
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  }

  function diffDaysFromToday(dateStr){
    if(!dateStr) return null;
    const today = new Date();
    const d = new Date(dateStr);
    if(isNaN(d)) return null;
    // normalizza a mezzanotte locale
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((d0 - t0) / 86400000);
  }

  function formatDateIT(dateStr){
    try{
      if(!dateStr) return '';
      const d = new Date(dateStr);
      if(isNaN(d)) return '';
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }catch(_){ return ''; }
  }

    function buildInventoryQuery(lot, name, format){
    const parts = [];

    const l = String(lot || '').trim();
    const n = String(name || '').trim();
    const f = String(format || '').trim();

    if(l) parts.push(l);
    if(n) parts.push(n);
    if(f) parts.push(f);

    // es: "333 tonno 200g"
      return parts.join(' ').toLowerCase();

}

  function buildTasks({ lotsWithStock, movements, settings }){
    const lots = Array.isArray(lotsWithStock) ? lotsWithStock : [];
    const moves = Array.isArray(movements) ? movements : [];

    const generalDays = Math.max(1, safeInt(settings?.expiry_alert_general_days, 30));
    const criticalDays = Math.max(0, Math.min(generalDays, safeInt(settings?.expiry_alert_critical_days, 7)));
    const includeZero = !!settings?.expiry_include_zero_stock;

    const tasks = [];

    // --- Expiry-based tasks (lots)
    for(const l of lots){
      const stock = Number(l?.stock) || 0;
      if(!includeZero && stock <= 0) continue;

      const dd = diffDaysFromToday(l?.expiration_date);
      if(dd == null) continue;

      const lotNumber = String(l?.lot_number || '').trim();

      // Nome + formato (richiesta tua)
      const productName = String(l?.product_name || 'Prodotto').trim();
      const format = String(l?.format || '').trim();
      const product = format ? `${productName} • ${format}` : productName;

      // --- SCADUTO con stock
      if(dd < 0 && stock > 0){
        tasks.push({
          prio: 0,
          kind: 'expired',
          pill: 'SCADUTO',
          pillClass: 'danger',
          icon: '❌',
          title: `Scaduto in stock`,
          meta: [`${product}`, `Lotto ${lotNumber || '—'}`, `Stock ${stock}`, `Scad. ${formatDateIT(l.expiration_date)}`],
          action: {
            label: 'Apri lotti',
            tabId: 'tab_inventory',
            view: 'lots',
            resetFilters: true,
            query: buildInventoryQuery(lotNumber, productName, format) // per ricerca meglio il lotto, fallback nome
          }
        });
        continue;
      }

      // --- CRITICO
      if(dd >= 0 && dd <= criticalDays && stock > 0){
        tasks.push({
          prio: 1,
          kind: 'critical',
          pill: `CRITICO`,
          pillClass: 'danger',
          icon: '🔴',
          title: `Scadenza critica`,
          meta: [`${product}`, `Lotto ${lotNumber || '—'}`, `Scade tra ${dd}g`, `Stock ${stock}`],
          action: {
            label: 'Apri lotti',
            tabId: 'tab_inventory',
            view: 'lots',
            resetFilters: true,
            query: buildInventoryQuery(lotNumber, productName, format) // per ricerca meglio il lotto, fallback nome
          }
        });
        continue;
      }

      // --- IN SCADENZA
      if(dd > criticalDays && dd <= generalDays && stock > 0){
        tasks.push({
          prio: 2,
          kind: 'warning',
          pill: `IN SCADENZA`,
          pillClass: 'warn',
          icon: '🟡',
          title: `In scadenza`,
          meta: [`${product}`, `Lotto ${lotNumber || '—'}`, `Scade tra ${dd}g`, `Stock ${stock}`],
          action: {
            label: 'Apri lotti',
            tabId: 'tab_inventory',
            view: 'lots',
            resetFilters: true,
            query: buildInventoryQuery(lotNumber, productName, format) // per ricerca meglio il lotto, fallback nome
          }
        });
      }
    }

    // --- Suspicious adjustments today (simple QC)
    try{
      const today = new Date();
      const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const yyyyMmDd = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth()+1).padStart(2,'0');
        const day = String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${day}`;
      };

      const todayStr = yyyyMmDd(new Date());

      const adjToday = moves.filter(m => {
        const type = String(m?.type || '').toUpperCase();
        if(!type.includes('ADJUST')) return false;

        const created = String(m?.created_at || '');
        // prende solo la data "YYYY-MM-DD" anche se c’è ora dopo
        const dStr = created.slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return false;

        return dStr === todayStr;
      });

      const forced = adjToday.filter(m => String(m?.reason || '').toUpperCase().includes('MODIFICA_FORZATA'));
      const totalAbs = adjToday.reduce((s,m)=> s + Math.abs(Number(m?.quantity)||0), 0);

      if(forced.length >= 2 || totalAbs >= 100){
        tasks.push({
          prio: 3,
          kind: 'qc',
          pill: 'CONTROLLO',
          pillClass: 'info',
          icon: '🕵️',
          title: `Rettifiche da controllare`,
          meta: [`Oggi: ${adjToday.length} rettifiche`, `Forzate: ${forced.length}`, `Totale (ass.): ${totalAbs}`],
          action: {
            label: 'Apri movimenti',
            tabId: 'tab_inventory',
            view: 'movements',     // 👈 non lots
            resetFilters: true,
            query: 'ADJUSTMENT'
          }
        });
      }
    }catch(_){ /* no-op */ }

    // Ordina e limita
    tasks.sort((a,b)=> (a.prio - b.prio));
    return tasks.slice(0, 8);
  }

  // --- Helpers specifici per Magazzino (selector REALI dal tuo index.html)

  function openTabByClick(tabId){
    const btn = document.querySelector(`.tab-btn[data-target="${tabId}"]`);
    if(btn) btn.click();
    else if(typeof window.activateTab === 'function') window.activateTab(tabId);
  }
function resetInventoryFiltersSafe(){

  // 1️⃣ Reset ufficiale (il tuo chip reset)
  const resetChip = document.querySelector('#inv_chips button[data-inv-chip="reset"]');
  if(resetChip){
    resetChip.click();
  }

  // 2️⃣ Disattiva esplicitamente "Solo attivi"
  // (per sicurezza anche se reset non lo spegne)
  const onlyActiveChip = document.querySelector('#inv_chips button[data-inv-chip="onlyActive"]');

  if(onlyActiveChip && onlyActiveChip.classList.contains('active')){
    onlyActiveChip.click();
  }

  // 3️⃣ Assicurati che gli scaduti NON siano nascosti
  const hideExpiredChip = document.querySelector('#inv_chips button[data-inv-chip="hideExpired"]');

  if(hideExpiredChip && hideExpiredChip.classList.contains('active')){
    hideExpiredChip.click();
  }
}

function scrollToInventoryLotsSafe(){

  // toolbar dove stanno i bottoni "Per prodotto / Per lotti"
  const lotsToggle = document.getElementById('inv_view_lots');
  if(!lotsToggle) return;

  const controls = lotsToggle.closest('.inv-controls');
  if(!controls) return;

  const offset = 20; // aumenta se vuoi più spazio sopra
  const y = controls.getBoundingClientRect().top + window.pageYOffset - offset;

  window.scrollTo({
    top: y,
    behavior: 'smooth'
  });
}

function scrollToInventoryMovementsSafe(){
  // trova l'header (card-head) della card Movimenti
  const heads = document.querySelectorAll('#tab_inventory .card .card-head');
  let head = null;

  for(const el of heads){
    const h3 = el.querySelector('h3');
    const txt = String(h3?.textContent || '').toLowerCase();
    if(txt.includes('movimenti')){
      head = el;
      break;
    }
  }

  if(!head) return;

  // offset per tenere visibili titolo + paginazione
  const offset = 20; // aumenta a 40/60 se hai topbar più "alta"
  const y = head.getBoundingClientRect().top + window.pageYOffset - offset;

  window.scrollTo({ top: y, behavior: 'smooth' });
}

  function forceInventoryLotsViewSafe(){
    // Bottone vista lotti (esiste nel tuo HTML)
    const lotsBtn = document.getElementById('inv_view_lots');
    if(lotsBtn){
      lotsBtn.click();
      return;
    }
    // fallback: niente
  }

  function setInventorySearchSafe(query){
    // usa la search bar del magazzino (non global)
    const invSearch = document.getElementById('inv_search');
    if(!invSearch) return;

    // 1) svuota sempre (così non resta un filtro vecchio)
    invSearch.value = '';
    invSearch.dispatchEvent(new Event('input', { bubbles: true }));

    // 2) se non c’è query, fine (hai solo resettato il filtro)
    const q = String(query || '').trim();
    if(!q) return;

    // 3) applica query
    invSearch.value = q;
    invSearch.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function navigateTo(tabId, query, opts){
    try{
      // 1) Apri tab Magazzino con click reale (così parte load + render)
      openTabByClick(tabId);

      // 2) Dopo render: reset filtri + vista lotti + ricerca
      // (timeout piccolo, safe; evita il "tab vuoto" e filtri che nascondono)
      setTimeout(()=>{
        if(opts?.resetFilters) resetInventoryFiltersSafe();

      // SOLO se vuoi la vista lotti
if(opts?.view === 'lots') {
  forceInventoryLotsViewSafe();

  // aspetta che la vista cambi e poi scrolla
  setTimeout(()=>{
    scrollToInventoryLotsSafe();
  }, 250);
}
      // se è movimenti, non toccare la vista lotti/prodotti
      if(opts?.view === 'movements') {
        // ok lascia i filtri resettati, poi vai giù ai movimenti
        setTimeout(()=>{ scrollToInventoryMovementsSafe(); }, 120);
      }

      setTimeout(()=>{
        setInventorySearchSafe(query);
      }, 80);

        // porta su (utile su mobile)
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 200);

    }catch(_){ /* safe */ }
  }

  function renderTaskRow(t){
    const meta = (Array.isArray(t.meta) ? t.meta : []).filter(Boolean);
    const metaText = meta.join(' • ');

    const tabId = t.action?.tabId || '';
    const query = t.action?.query || '';
    const view = t.action?.view || '';
    const reset = !!t.action?.resetFilters;

    return `
      <div class="wm-taskrow"
           data-tab="${escapeHtml(tabId)}"
           data-query="${escapeHtml(query)}"
           data-view="${escapeHtml(view)}"
           data-reset="${escapeHtml(String(reset))}">
        <div class="wm-taskrow-left">
          <div class="wm-taskicon" aria-hidden="true">${escapeHtml(t.icon || '•')}</div>
          <div class="wm-tasktext">
            <div style="display:flex; gap:8px; align-items:center; min-width:0; flex-wrap:wrap;">
              <div class="wm-tasktitle">${escapeHtml(t.title || '')}</div>
              <span class="wm-taskpill ${escapeHtml(t.pillClass || '')}">${escapeHtml(t.pill || '')}</span>
            </div>
            <div class="wm-taskmeta">${escapeHtml(metaText)}</div>
          </div>
        </div>
        <button class="wm-taskbtn" type="button">${escapeHtml(t.action?.label || 'Apri')}</button>
      </div>
    `;
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function bindClicks(container){
    if(!container) return;
    // delega click: clic su riga o bottone = stessa azione
    container.addEventListener('click', (ev)=>{
      const row = ev.target.closest('.wm-taskrow');
      if(!row) return;

      const tabId = row.getAttribute('data-tab') || '';
      const query = row.getAttribute('data-query') || '';
      const view  = row.getAttribute('data-view') || '';
      const reset = (row.getAttribute('data-reset') || '') === 'true';

      if(tabId) navigateTo(tabId, query, { view, resetFilters: reset });
    });
  }

  function render(payload){
    const listEl = document.getElementById('home_tasks_list');
    const subEl = document.getElementById('home_tasks_subtitle');
    const countEl = document.getElementById('home_tasks_count');
    const toggleEl = document.getElementById('home_tasks_toggle');
    if(!listEl) return;

    const tasks = buildTasks(payload || {});
    if(countEl) countEl.textContent = String(tasks.length || 0);

    if(subEl){
      subEl.textContent = tasks.length
        ? `Priorità automatiche • ${tasks.length} task`
        : 'Niente di urgente oggi';
    }

    // Toggle visibility / state (compact)
    if(toggleEl){
      if(tasks.length <= 3){
        toggleEl.style.display = 'none';
        listEl.classList.remove('is-collapsed');
      }else{
        toggleEl.style.display = '';
        listEl.classList.add('is-collapsed');
        toggleEl.textContent = 'Mostra';
        toggleEl.onclick = ()=>{
          const collapsed = listEl.classList.toggle('is-collapsed');
          toggleEl.textContent = collapsed ? 'Mostra' : 'Nascondi';
        };
      }
    }

    if(!tasks.length){
      listEl.innerHTML = `<div class="muted">Nessuna task urgente 🎉</div>`;
      return;
    }

    listEl.innerHTML = tasks.map(renderTaskRow).join('');
    bindClicks(listEl);
  }

  // Expose
  window.WMHomeTasks = { render };
})();