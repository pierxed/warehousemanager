// ---------- DASHBOARD ----------
let salesChart = null;
let SHOW_ARCHIVED_PRODUCTS = false;

// ==========================
// SETTINGS (v0.2)
// - safe defaults: se API/tabella manca, l'app continua a funzionare.
// ==========================
const DEFAULT_SETTINGS = {
  expiry_alert_days: 30,
  expiry_include_zero_stock: false,

  low_stock_alert_enabled: true,
  low_stock_threshold_units: 10,

  sale_default_mode: 'FEFO', // FEFO | MANUAL
  confirm_sale_before_commit: true,

  scanner_auto_submit_on_ean: false,
  scanner_beep_on_success: false,
  scanner_vibrate_on_error: false,
};

let SETTINGS = { ...DEFAULT_SETTINGS };

function coerceBool(v){
  if(typeof v === 'boolean') return v;
  if(typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  return ['1','true','yes','on'].includes(s);
}

function normalizeSettings(raw){
  const out = { ...DEFAULT_SETTINGS };
  if(!raw || typeof raw !== 'object') return out;

  if(raw.expiry_alert_days != null){
    const d = Math.max(1, Math.min(365, parseInt(raw.expiry_alert_days, 10) || DEFAULT_SETTINGS.expiry_alert_days));
    out.expiry_alert_days = d;
  }
  if(raw.expiry_include_zero_stock != null) out.expiry_include_zero_stock = coerceBool(raw.expiry_include_zero_stock);

  if(raw.low_stock_alert_enabled != null) out.low_stock_alert_enabled = coerceBool(raw.low_stock_alert_enabled);
  if(raw.low_stock_threshold_units != null){
    out.low_stock_threshold_units = Math.max(0, parseInt(raw.low_stock_threshold_units, 10) || 0);
  }

  if(raw.sale_default_mode != null){
    const m = String(raw.sale_default_mode).trim().toUpperCase();
    out.sale_default_mode = (m === 'MANUAL') ? 'MANUAL' : 'FEFO';
  }
  if(raw.confirm_sale_before_commit != null) out.confirm_sale_before_commit = coerceBool(raw.confirm_sale_before_commit);

  if(raw.scanner_auto_submit_on_ean != null) out.scanner_auto_submit_on_ean = coerceBool(raw.scanner_auto_submit_on_ean);
  if(raw.scanner_beep_on_success != null) out.scanner_beep_on_success = coerceBool(raw.scanner_beep_on_success);
  if(raw.scanner_vibrate_on_error != null) out.scanner_vibrate_on_error = coerceBool(raw.scanner_vibrate_on_error);

  return out;
}

async function loadSettings(){
  try {
    const res = await fetchJSON('api_settings_get.php');
    const s = normalizeSettings(res?.settings);
    SETTINGS = s;
  } catch (e) {
    // fallback: defaults
    SETTINGS = { ...DEFAULT_SETTINGS };
  }

  applySettingsToUI();
}

function applySettingsToUI(){
  // Home labels
  const lbl = document.getElementById('card_expiring_label');
  if(lbl) lbl.innerHTML = `Lotti in scadenza &lt; ${SETTINGS.expiry_alert_days}gg`;

  const badgeMid = document.getElementById('badge_expiry_mid');
  if(badgeMid){
    const d = Math.max(7, SETTINGS.expiry_alert_days);
    badgeMid.textContent = `8–${d} giorni`;
  }

  const sub = document.getElementById('expiry_subtitle');
  if(sub){
    sub.textContent = SETTINGS.expiry_include_zero_stock ? 'Include anche stock = 0' : 'Solo stock > 0';
  }

  // Vendita default
  const manualToggle = document.getElementById('sale_manual_toggle');
  if(manualToggle){
    const shouldManual = SETTINGS.sale_default_mode === 'MANUAL';
    if(manualToggle.checked !== shouldManual){
      manualToggle.checked = shouldManual;
      if(window.__SALE_UI_READY){
        manualToggle.dispatchEvent(new Event('change'));
      }
    }
  }
}

function fillSettingsForm(){
  const v = SETTINGS;
  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = String(val); };
  const setChk = (id, val) => { const el = document.getElementById(id); if(el) el.checked = !!val; };

  setVal('set_expiry_alert_days', v.expiry_alert_days);
  setChk('set_expiry_include_zero_stock', v.expiry_include_zero_stock);

  setChk('set_low_stock_alert_enabled', v.low_stock_alert_enabled);
  setVal('set_low_stock_threshold_units', v.low_stock_threshold_units);

  const mode = document.getElementById('set_sale_default_mode');
  if(mode) mode.value = v.sale_default_mode;
  setChk('set_confirm_sale_before_commit', v.confirm_sale_before_commit);

  setChk('set_scanner_auto_submit_on_ean', v.scanner_auto_submit_on_ean);
  setChk('set_scanner_beep_on_success', v.scanner_beep_on_success);
  setChk('set_scanner_vibrate_on_error', v.scanner_vibrate_on_error);
}

function collectSettingsFromForm(){
  const getVal = (id) => document.getElementById(id)?.value;
  const getChk = (id) => document.getElementById(id)?.checked === true;

  const days = Math.max(1, Math.min(365, parseInt(getVal('set_expiry_alert_days'), 10) || DEFAULT_SETTINGS.expiry_alert_days));
  const threshold = Math.max(0, parseInt(getVal('set_low_stock_threshold_units'), 10) || 0);
  const mode = String(getVal('set_sale_default_mode') || 'FEFO').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'FEFO';

  return {
    expiry_alert_days: days,
    expiry_include_zero_stock: getChk('set_expiry_include_zero_stock'),

    low_stock_alert_enabled: getChk('set_low_stock_alert_enabled'),
    low_stock_threshold_units: threshold,

    sale_default_mode: mode,
    confirm_sale_before_commit: getChk('set_confirm_sale_before_commit'),

    scanner_auto_submit_on_ean: getChk('set_scanner_auto_submit_on_ean'),
    scanner_beep_on_success: getChk('set_scanner_beep_on_success'),
    scanner_vibrate_on_error: getChk('set_scanner_vibrate_on_error'),
  };
}

async function saveSettingsFromForm(){
  const msg = document.getElementById('settings_message');
  const setMsg = (t, cls='muted') => {
    if(!msg) return;
    msg.className = cls;
    msg.textContent = t;
  };

  try {
    const payload = collectSettingsFromForm();
    setMsg('Salvataggio…');
    const res = await fetchJSON('api_settings_save.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ settings: payload })
    });

    if(res?.success === false){
      setMsg(res?.error || 'Errore nel salvataggio', 'message error');
      return;
    }

    SETTINGS = normalizeSettings(res?.settings || payload);
    applySettingsToUI();
    fillSettingsForm();

    // Ricarica Home per rifare i filtri scadenze
    await loadHomeDashboard();
    if(Cache.inventoryData && Cache.inventoryInsights){
      renderInventoryFromCache(tokenize(getGlobalQuery()));
    }
    applyGlobalSearch();

    setMsg('✅ Salvato', 'message success');
  } catch (e) {
    console.error(e);
    setMsg('Errore: controlla tabella settings e API', 'message error');
  }
}

// feedback scanner (safe)
async function scanFeedback(ok){
  try {
    if(ok && SETTINGS.scanner_beep_on_success){
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(AudioCtx){
        const ctx = new AudioCtx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.04;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        setTimeout(()=>{ try{o.stop();}catch{} try{ctx.close();}catch{} }, 90);
      }
    }
    if(!ok && SETTINGS.scanner_vibrate_on_error && navigator.vibrate){
      navigator.vibrate([70, 40, 70]);
    }
  } catch(_){}
}

function isMobile(){
  return window.matchMedia("(max-width: 680px)").matches;
}

function renderMobileRows(tbody, rows){
  // attiva stile "cards" sulla tabella
  const table = tbody.closest('table');
  if(table) table.classList.add('mobile-cards');

  tbody.innerHTML = rows.map(r => `
    <tr class="mcard">
      <td class="mcard-td">
        <div class="mcard-top">
          <div class="mcard-left">
            <div class="mcard-title">${r.title}</div>
            <div class="mcard-lines">
              ${r.lines.map(x => `<div class="mcard-line">${x}</div>`).join("")}
            </div>
          </div>
          ${r.right ? `<div class="mcard-right">${r.right}</div>` : ``}
        </div>
      </td>
    </tr>
  `).join("") || `<tr class="mcard"><td class="mcard-td muted">Nessuna</td></tr>`;
}

function renderMobileCards(container, rows){
  if(!container) return;
  container.innerHTML = rows.map(r => `
    <div class="mcard">
      <div class="mcard-td">
        <div class="mcard-top">
          <div class="mcard-left">
            <div class="mcard-title">${r.title}</div>
            <div class="mcard-lines">
              ${r.lines.map(x => `<div class="mcard-line">${x}</div>`).join("")}
            </div>
          </div>
          ${r.right ? `<div class="mcard-right">${r.right}</div>` : ``}
        </div>
      </div>
    </div>
  `).join("") || `<div class="mcard"><div class="mcard-td muted">Nessuna</div></div>`;
}


// ==========================
// GLOBAL SEARCH (filter + highlight)
// ==========================
const Cache = {
  homeLotsWithStock: null,  // array lots con stock calcolato
  homeMovements: null,      // movimenti raw (per ultimi movimenti)
  adjustLotsWithStock: null,
  adjustMovements: null,
  productsRows: null,       // api_products_with_stock.php (array rows)

  // Magazzino (tab_inventory)
  inventoryData: null,      // risposta api_inventory.php
  inventoryInsights: null   // risposta api_inventory_insights.php
};

function getGlobalQuery(){
  return (document.getElementById('global_search')?.value || '').trim();
}
function tokenize(q){
  return String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
}
function matchesTokens(haystack, tokens){
  const h = String(haystack || '').toLowerCase();
  return tokens.every(t => h.includes(String(t).toLowerCase()));
}
function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlightTextRaw(text, tokens){
  const raw = String(text ?? '');
  if(!tokens.length) return escapeHtml(raw);

  let out = raw;

  // tokens lunghi prima (evita che "to" mangi "tonno")
  const sorted = [...tokens].sort((a,b)=> b.length - a.length);

  sorted.forEach(t => {
    if(!t) return;
    const re = new RegExp(`(${escapeRegExp(t)})`, 'ig');
    out = out.replace(re, '[[HL]]$1[[/HL]]');
  });

  out = escapeHtml(out)
    .replaceAll('[[HL]]', '<mark class="hl">')
    .replaceAll('[[/HL]]', '</mark>');

  return out;
}

function updateGlobalSearchHint(){
  const q = getGlobalQuery();
  const hint = document.getElementById('global_search_hint');
  const txt = document.getElementById('global_search_hint_text');
  if(!hint || !txt) return;

  if(q){
    txt.textContent = q;
    hint.style.display = 'inline-flex';
  } else {
    hint.style.display = 'none';
    txt.textContent = '';
  }
}

function isTabActive(tabId){
  const t = document.getElementById(tabId);
  return !!t && t.classList.contains('active');
}

// chiamata unica per riapplicare filtro a tutte le viste
function applyGlobalSearch(){
  const tokens = tokenize(getGlobalQuery());

  // Prodotti
  if(Cache.productsRows) renderProductsFromRows(Cache.productsRows, tokens);

  // Home: ultimi movimenti
  if(Cache.homeMovements && Cache.homeLotsWithStock) renderLastMovesFromCache(tokens);

  // Rettifiche
  if(Cache.adjustMovements && Cache.adjustLotsWithStock) renderAdjustmentsFromCache(tokens);

  // Stock e Lotti (usano cache Home)
  if(Cache.homeLotsWithStock) {
    renderStockTableFromCache(tokens);
    renderLotsTableFromCache(tokens);
  }

  // Magazzino (usa cache)
  if(Cache.inventoryData && Cache.inventoryInsights){
    renderInventoryFromCache(tokens);
  }

  updateGlobalSearchHint();
}

// ==========================
// HOME DASHBOARD
// ==========================
async function loadHomeDashboard(){

  const lots = await fetchJSON('api_lots.php');
  const movements = await fetchJSON('api_movements.php');
  const today = new Date();

  const stockByLot = new Map();

  for(const m of movements){
    const lotId = Number(m.lot_id);
    if(!lotId) continue;

    const qty = Number(m.quantity) || 0;
    const prev = stockByLot.get(lotId) || 0;

    if(m.type === 'PRODUCTION') stockByLot.set(lotId, prev + qty);
    else if(m.type === 'SALE') stockByLot.set(lotId, prev - qty);
    else if(m.type === 'ADJUSTMENT') stockByLot.set(lotId, prev + qty);
  }

  const lotsWithStock = lots.map(l => ({
    ...l,
    stock: stockByLot.get(Number(l.lot_id)) || 0
  }));

  Cache.homeLotsWithStock = lotsWithStock;
  Cache.homeMovements = movements;

  const totalStock = lotsWithStock.reduce((s,l)=> s + Math.max(0, Number(l.stock)||0), 0);
  document.getElementById('card_total_stock').innerText = totalStock;

  // ✅ Stock + Lotti (con highlight)
  const tokens = tokenize(getGlobalQuery());
  renderStockTableFromCache(tokens);
  renderLotsTableFromCache(tokens);

  const totalTodayProduction = movements
    .filter(m => m.type === 'PRODUCTION' && isSameLocalDay(m.created_at, today))
    .reduce((s,m)=> s + (Number(m.quantity)||0), 0);

  document.getElementById('card_today_production').innerText = totalTodayProduction;

  const expiryDays = Math.max(1, Number(SETTINGS?.expiry_alert_days ?? 30));
  const includeZero = !!SETTINGS?.expiry_include_zero_stock;

  const expiringLots = lotsWithStock.filter(l=>{
    if(!l.expiration_date) return false;
    const diffDays = Math.ceil((new Date(l.expiration_date) - today)/(1000*60*60*24));
    const st = Number(l.stock)||0;
    if(!includeZero && st <= 0) return false;
    return diffDays <= expiryDays && diffDays >= 0;
  });

  document.getElementById('card_expiring').innerText = expiringLots.length;

  const tb7 = document.getElementById('expiry_7_table');
  const tb30 = document.getElementById('expiry_30_table');

  if(tb7 && tb30){
    tb7.innerHTML = '';
    tb30.innerHTML = '';

    const inDays = (d) => Math.ceil((new Date(d) - today) / (1000*60*60*24));

    const exp7 = [];
    const expMid = [];

    expiringLots
      .sort((a,b)=> new Date(a.expiration_date) - new Date(b.expiration_date))
      .forEach(l=>{
        const days = inDays(l.expiration_date);

        if(days >= 0 && days <= 7) exp7.push(l);
        else if(days >= 8 && days <= expiryDays) expMid.push(l);
      });

    if(isMobile()){
      renderMobileRows(tb7, exp7.slice(0,8).map(l => ({
        title: l.product_name,
        lines: [
          `Lotto: <strong>${l.lot_number}</strong>`,
          `Scadenza: <strong>${formatDateIT(l.expiration_date)}</strong>`
        ],
        right: `${l.stock}`
      })));

      renderMobileRows(tb30, expMid.slice(0,8).map(l => ({
        title: l.product_name,
        lines: [
          `Lotto: <strong>${l.lot_number}</strong>`,
          `Scadenza: <strong>${formatDateIT(l.expiration_date)}</strong>`
        ],
        right: `${l.stock}`
      })));
    } else {
      tb7.innerHTML = exp7.slice(0,8).map(l => `
        <tr>
          <td>${l.product_name}</td>
          <td>${l.lot_number}</td>
          <td>${l.stock}</td>
          <td>${formatDateIT(l.expiration_date)}</td>
        </tr>
      `).join('') || `<tr><td colspan="4" class="muted">Nessuna</td></tr>`;

      tb30.innerHTML = expMid.slice(0,8).map(l => `
        <tr>
          <td>${l.product_name}</td>
          <td>${l.lot_number}</td>
          <td>${l.stock}</td>
          <td>${formatDateIT(l.expiration_date)}</td>
        </tr>
      `).join('') || `<tr><td colspan="4" class="muted">Nessuna</td></tr>`;
    }
  }

  // ✅ ultimi movimenti (con highlight + filtro globale)
  renderLastMovesFromCache(tokens);

  const salesEl = document.getElementById('salesChart');
  if(salesEl){
    const lotById = new Map(lotsWithStock.map(l => [Number(l.lot_id), l]));

    const from = new Date(today);
    from.setDate(from.getDate() - 30);

    const soldByProduct = new Map();

    movements.forEach(m=>{
      if(m.type !== 'SALE') return;

      const d = new Date((m.created_at||'').replace(' ', 'T'));
      if(isNaN(d) || d < from) return;

      const lot = lotById.get(Number(m.lot_id)) || null;
      const productName = lot?.product_name || 'Sconosciuto';

      const qty = Number(m.quantity)||0;
      soldByProduct.set(productName, (soldByProduct.get(productName)||0) + qty);
    });

    const top = [...soldByProduct.entries()]
      .sort((a,b)=> b[1]-a[1])
      .slice(0, 10);

    const labels = top.map(x=> x[0]);
    const data = top.map(x=> x[1]);

    if(salesChart) salesChart.destroy();

    salesChart = new Chart(salesEl, {
      type: 'bar',
      data:{
        labels,
        datasets:[{ label:'Barattoli venduti', data }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        scales:{ y:{ beginAtZero:true } }
      }
    });
  }

  showExpiryToasts(expiringLots);
}

function renderLastMovesFromCache(tokens){
  const movesTb = document.getElementById('last_moves_table');
  if(!movesTb) return;

  const lotsWithStock = Cache.homeLotsWithStock || [];
  const movements = Cache.homeMovements || [];

  const lotById = new Map(lotsWithStock.map(l => [Number(l.lot_id), l]));

  const typeLabel = (t) =>
    t === 'SALE' ? 'Vendita' :
    (t === 'PRODUCTION' ? 'Produzione' :
    (t === 'ADJUSTMENT' ? 'Rettifica' : t));

  const sortedMovesAll = [...movements].sort((a,b)=>{
    const da = new Date((a.created_at||'').replace(' ', 'T'));
    const db = new Date((b.created_at||'').replace(' ', 'T'));
    return db - da;
  });

  // filtro globale
  let sortedMoves = sortedMovesAll;
  if(tokens.length){
    sortedMoves = sortedMovesAll.filter(m=>{
      const lot = lotById.get(Number(m.lot_id)) || null;
      const hay =
        `${m.created_at} ${m.type} ${m.reason||''} ${m.note||''} ${m.quantity||''} `+
        `${lot?.fish_type||''} ${lot?.product_name||''} ${lot?.format||''} ${lot?.ean||''} ${lot?.lot_number||''} ${lot?.expiration_date||''}`;
      return matchesTokens(hay, tokens);
    });
  }

  sortedMoves = sortedMoves.slice(0, 10);

  movesTb.innerHTML = '';

  if(isMobile()){
    renderMobileRows(movesTb, sortedMoves.map(m => {
      const lot = lotById.get(Number(m.lot_id)) || null;

      const typeClass =
        m.type === 'SALE'
          ? 'sale'
          : (m.type === 'PRODUCTION' ? 'production' : (m.type === 'ADJUSTMENT' ? 'adjustment' : ''));

      const expiration = lot?.expiration_date
        ? formatDateIT(lot.expiration_date)
        : '—';

      const qty = Number(m.quantity)||0;
      const qtyDisplay =
        m.type === 'SALE'
          ? `−${Math.abs(qty)}`
          : (m.type === 'ADJUSTMENT'
              ? (qty < 0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`)
              : `+${Math.abs(qty)}`);

      const reasonTxt = (m.type === 'ADJUSTMENT' && m.reason)
        ? `Motivo: <strong>${highlightTextRaw(String(m.reason).replaceAll('_',' '), tokens)}</strong>`
        : null;

      return {
        title: `${highlightTextRaw(lot?.product_name || '—', tokens)} ${lot?.format ? '• ' + highlightTextRaw(lot.format, tokens) : ''}`,
        lines: [
          `<span class="badge-move ${typeClass}">${highlightTextRaw(typeLabel(m.type), tokens)}</span> • <strong>${highlightTextRaw(formatDateIT(m.created_at), tokens)}</strong>`,
          `Lotto: <strong>${highlightTextRaw(lot?.lot_number || '—', tokens)}</strong>`,
          `Scadenza: <strong>${highlightTextRaw(expiration, tokens)}</strong>`,
          ...(reasonTxt ? [reasonTxt] : []),
          ...(m.type === 'ADJUSTMENT' && m.note ? [`Nota: ${highlightTextRaw(String(m.note), tokens)}`] : [])
        ],
        right: highlightTextRaw(qtyDisplay, tokens)
      };
    }));
    return;
  }

  sortedMoves.forEach(m=>{
    const lot = lotById.get(Number(m.lot_id)) || null;

    const typeClass =
      m.type === 'SALE'
        ? 'sale'
        : (m.type === 'PRODUCTION' ? 'production' : (m.type === 'ADJUSTMENT' ? 'adjustment' : ''));

    const typeText = typeLabel(m.type);

    const expiration = lot?.expiration_date
      ? formatDateIT(lot.expiration_date)
      : '—';

    const qty = Number(m.quantity)||0;
    const qtyDisplay =
      m.type === 'SALE'
        ? `−${Math.abs(qty)}`
        : (m.type === 'ADJUSTMENT'
            ? (qty < 0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`)
            : `+${Math.abs(qty)}`);

    const reasonCell = (m.type === 'ADJUSTMENT')
      ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">
           ${m.reason ? `Motivo: <strong>${highlightTextRaw(String(m.reason).replaceAll('_',' '), tokens)}</strong>` : ''}
           ${m.note ? `<div>Nota: ${highlightTextRaw(String(m.note), tokens)}</div>` : ''}
         </div>`
      : '';

    const tr = document.createElement('tr');
    tr.className = `move-row ${typeClass}`;

    tr.innerHTML = `
      <td>${highlightTextRaw(formatDateIT(m.created_at), tokens)}</td>
      <td><span class="badge-move ${typeClass}">${highlightTextRaw(typeText, tokens)}</span></td>
      <td>
        <div style="font-weight:700;">${highlightTextRaw(lot?.product_name || '—', tokens)}</div>
        <div style="font-size:12px;color:#94a3b8;">${highlightTextRaw(lot?.format || '', tokens)}</div>
        ${reasonCell}
      </td>
      <td><strong>${highlightTextRaw(lot?.lot_number || '—', tokens)}</strong></td>
      <td>${highlightTextRaw(expiration, tokens)}</td>
      <td style="font-weight:900;">${highlightTextRaw(qtyDisplay, tokens)}</td>
    `;

    movesTb.appendChild(tr);
  });

  if(sortedMoves.length === 0){
    movesTb.innerHTML = `<tr><td colspan="6" class="muted">Nessun risultato</td></tr>`;
  }
}

function showExpiryToasts(expiringLots){
  const container = document.getElementById('expiry_toasts');
  if(!container) return;
  container.innerHTML = '';

  expiringLots.slice(0, 6).forEach(l=>{
    const today = new Date();
    const diffDays = Math.ceil((new Date(l.expiration_date)-today)/(1000*60*60*24));

    const div = document.createElement('div');
    div.className = 'expiry_toast';
    div.innerText =
      `⚠ Lotto ${l.lot_number} (${l.product_name}) scade il ${formatDateIT(l.expiration_date)} (${diffDays} giorni)!`;

    container.appendChild(div);

    setTimeout(()=>{
      div.style.animation='slideOut 0.5s forwards';
      setTimeout(()=>div.remove(),500);
    },6000);
  });
}

// ---------- UTILS ----------
function lockLotFields(){
  const lot = document.getElementById('lot_number');
  const exp = document.getElementById('expiration_date');

  lot.disabled = true;
  exp.disabled = true;

  lot.value = '';
  exp.value = '';

  lot.style.background = '#eee';
  exp.style.background = '#eee';
}

function unlockLotFields(){
  const lot = document.getElementById('lot_number');
  const exp = document.getElementById('expiration_date');

  lot.disabled = false;
  exp.disabled = false;

  lot.style.background = '';
  exp.style.background = '';
}

function formatDateIT(dateString){
  if(!dateString) return '';
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function isSameLocalDay(mysqlDateTime, today = new Date()){
  if(!mysqlDateTime) return false;
  const d = new Date(mysqlDateTime.replace(' ', 'T'));
  return d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
}

async function fetchJSON(url, options){
  const res = await fetch(url, options);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e){ throw new Error(`Risposta non JSON da ${url}: ${text.slice(0,200)}`); }
}

async function fetchProductByEAN(ean){
  return await fetchJSON('api_get_product.php?ean=' + encodeURIComponent(ean));
}

// ---------- PRODUCTS DROPDOWN ----------
let PRODUCTS = [];

function extractWeight(format){
  if(!format) return 0;
  const match = format.match(/(\d+)/);
  return match ? parseInt(match[1],10) : 0;
}

async function loadProducts() {

  PRODUCTS = await fetchJSON('api_products.php');
  PRODUCTS = PRODUCTS || [];

  const productNames = [...new Set(PRODUCTS.map(p => p.name))]
    .sort((a,b)=> a.localeCompare(b));

  // ----- PRODUZIONE: clona select per evitare listener duplicati -----
  const nameSelect0 = document.getElementById('product_name_select');
  const formatSelect0 = document.getElementById('prod_select');
  const info = document.getElementById('prod_info');

  if(!nameSelect0 || !formatSelect0) return;

  const nameSelect = nameSelect0.cloneNode(true);
  nameSelect0.parentNode.replaceChild(nameSelect, nameSelect0);

  const formatSelect = formatSelect0.cloneNode(true);
  formatSelect0.parentNode.replaceChild(formatSelect, formatSelect0);

  nameSelect.innerHTML = `<option value="">-- Seleziona prodotto --</option>`;
  productNames.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    nameSelect.appendChild(opt);
  });

  nameSelect.addEventListener('change', ()=>{
    const selectedName = nameSelect.value;

    formatSelect.innerHTML = `<option value="">-- Seleziona formato --</option>`;
    info.textContent = '';
    document.getElementById('prod_ean').value = '';

    if(!selectedName) return;

    const filtered = PRODUCTS
      .filter(p => p.name === selectedName)
      .sort((a,b)=> extractWeight(a.format) - extractWeight(b.format));

    filtered.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.format} - ${p.units_per_tray} per vassoio`;
      opt.dataset.units = p.units_per_tray;
      opt.dataset.ean = p.ean;
      formatSelect.appendChild(opt);
    });
  });

  formatSelect.addEventListener('change', async ()=>{
    const opt = formatSelect.options[formatSelect.selectedIndex];

    if(!opt || !opt.value){
      lockLotFields();
      return;
    }

    document.getElementById('prod_ean').value = opt.dataset.ean || '';
    document.getElementById('prod_info').textContent = `Unità per vassoio: ${opt.dataset.units}`;

    unlockLotFields();
    await refreshTodayBatches();
  });

  // ----- VENDITA: popola select nome + formato -----
  (function initSaleSelectors(){
    const ns0 = document.getElementById('sale_product_name_select');
    const fs0 = document.getElementById('sale_prod_select');
    if(!ns0 || !fs0) return;

    const ns = ns0.cloneNode(true);
    ns0.parentNode.replaceChild(ns, ns0);

    const fs = fs0.cloneNode(true);
    fs0.parentNode.replaceChild(fs, fs0);

    ns.innerHTML = `<option value="">-- Seleziona prodotto --</option>`;
    productNames.forEach(name=>{
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      ns.appendChild(opt);
    });

    ns.addEventListener('change', ()=>{
      const selectedName = ns.value;
      fs.innerHTML = `<option value="">-- Seleziona formato --</option>`;
      if(!selectedName) return;

      const filtered = PRODUCTS
        .filter(p => p.name === selectedName)
        .sort((a,b)=> extractWeight(a.format) - extractWeight(b.format));

      filtered.forEach(p=>{
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.format} - ${p.units_per_tray} per vassoio`;
        opt.dataset.ean = p.ean || '';
        fs.appendChild(opt);
      });
    });

    fs.addEventListener('change', ()=>{
      const opt = fs.options[fs.selectedIndex];
      if(!opt || !opt.value) return;
      const barcode = document.getElementById('barcode');
      if (barcode && opt.dataset.ean) barcode.value = opt.dataset.ean;
    });
  })();
}

// ---------- LOT MANAGEMENT ----------
async function checkBatchWarning(lotNumber){

  const warningDiv = document.getElementById('lot_warning');
  const expirationInput = document.getElementById('expiration_date');
  const formatSelect = document.getElementById('prod_select');

  warningDiv.innerHTML = '';

  if(!lotNumber){
    return;
  }

  if(!formatSelect.value){
    warningDiv.innerHTML = `
      <div class="message" style="background:#e3f2fd;color:#0d47a1;">
        ℹ Seleziona prima prodotto e formato.
      </div>
    `;
    return;
  }

  const selectedProduct = PRODUCTS.find(p => p.id == formatSelect.value);
  if(!selectedProduct) return;

  const selectedFishType = selectedProduct.fish_type;

  const data = await fetchJSON(
    'api_check_batch.php?lot_number=' + encodeURIComponent(lotNumber)
  );

  if(data.exists){

    if(data.fish_type !== selectedFishType){

      warningDiv.innerHTML = `
        <div class="message error">
          ⚠ Questo lotto appartiene a ${data.fish_type}.
          Non puoi usarlo per ${selectedFishType}.
        </div>
      `;

      expirationInput.value = '';
      expirationInput.readOnly = true;
      expirationInput.style.background = '#eee';

      return;
    }

    warningDiv.innerHTML = `
      <div class="message success">
        ✔ Lotto esistente (${data.fish_type}) creato il ${formatDateIT(data.production_date)}
      </div>
    `;

    expirationInput.value = data.expiration_date;
    expirationInput.readOnly = true;
    expirationInput.style.background = '#eee';

  } else {

    warningDiv.innerHTML = `
      <div class="message" style="background:#e3f2fd;color:#0d47a1;">
        ℹ Lotto nuovo. Inserisci la scadenza.
      </div>
    `;

    expirationInput.readOnly = false;
    expirationInput.style.background = '';
  }
}

async function refreshTodayBatches(){

  const dl = document.getElementById('lot_suggestions');
  const quick = document.getElementById('lot_quick');
  const formatSelect = document.getElementById('prod_select');

  if(!dl || !formatSelect.value) return;

  const selectedProduct = PRODUCTS.find(p => p.id == formatSelect.value);
  if(!selectedProduct) return;

  const selectedFishType = selectedProduct.fish_type;

  const rows = await fetchJSON('api_batches_today.php');

  const filtered = rows.filter(r => r.fish_type === selectedFishType);

  dl.innerHTML = '';
  quick.innerHTML = '';

  filtered.forEach(r=>{
    const opt = document.createElement('option');
    opt.value = r.lot_number;
    dl.appendChild(opt);
  });

  filtered.slice(0,12).forEach(r=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lot-chip';
    b.textContent = r.lot_number;

    b.addEventListener('click', async ()=>{
      const lotInput = document.getElementById('lot_number');
      if(!lotInput) return;

      lotInput.value = r.lot_number;
      await checkBatchWarning(r.lot_number);
    });

    quick.appendChild(b);
  });

  if(filtered.length === 0){
    quick.innerHTML = `<span style="color:#777;">Nessun lotto recente per questo tipo di pesce.</span>`;
  }
}

document.getElementById('lot_number')?.addEventListener('focus', refreshTodayBatches);

// ---------- PRODUZIONE ----------
document.getElementById('btn_production')?.addEventListener('click', async ()=>{

  const msg = document.getElementById('prod_message');
  msg.className = 'message';
  msg.textContent = '';

  const ean = document.getElementById('prod_ean').value.trim();
  const lot_number = document.getElementById('lot_number').value.trim();
  const expiration_date = document.getElementById('expiration_date').value;

  const quantityType = document.getElementById('quantity_type').value;
  const quantityInput = parseInt(document.getElementById('quantity_input').value, 10);

  if(!lot_number || !expiration_date || !quantityInput || quantityInput <= 0){
    msg.classList.add('error');
    msg.textContent = 'Compila lotto, scadenza e quantità.';
    return;
  }

  try{
    let product_id = null;

    if(ean){
      const product = await fetchProductByEAN(ean);
      if(product.error){
        msg.classList.add('error');
        msg.textContent = product.error;
        return;
      }
      product_id = product.id;
    } else {
      const sel = document.getElementById('prod_select');
      product_id = parseInt(sel.value, 10);

      if(!product_id){
        msg.classList.add('error');
        msg.textContent = 'Seleziona prima prodotto e formato.';
        return;
      }
    }

    const data = await fetchJSON('api_production.php',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        product_id,
        quantity_input: quantityInput,
        quantity_type: quantityType,
        lot_number,
        expiration_date
      })
    });

    if(data.error){
      msg.classList.add('error');
      msg.textContent = data.error;
      return;
    }

    msg.classList.add('success');
    msg.textContent = data.batch_reused
      ? `+${data.quantity} barattoli aggiunti al lotto ${data.lot_number}`
      : `Nuovo lotto ${data.lot_number} creato — ${data.quantity} barattoli prodotti`;

    await loadHomeDashboard();
    await loadProductsTable();
    Cache.inventoryData = null;
    Cache.inventoryInsights = null;
    if(isTabActive('tab_inventory')) await loadInventoryTab();
    applyGlobalSearch();

  }catch(err){
    console.error(err);
    msg.classList.add('error');
    msg.textContent = 'Errore produzione.';
  }
});

// ---------- VENDITA ----------
const SaleUI = (() => {
  let currentProduct = null;
  let suggestedLots = [];
  let selectedLots = new Map();

  const el = (id) => document.getElementById(id);
  const getQty = () => parseInt(el('sale_qty')?.value, 10) || 1;
  const isManual = () => !!el('sale_manual_toggle')?.checked;

  const setMsg = (type, text) => {
    const msg = el('sale_message');
    if (!msg) return;
    msg.className = 'message';
    msg.textContent = '';
    if(type) msg.classList.add(type);
    msg.textContent = text;
  };

  const ensureConfirmBox = () => {
    if (el('sale_confirm_box')) return;

    const btn = el('btn_sale');
    if(!btn) return;

    const card = btn.closest('.card') || btn.parentElement;
    if(!card) return;

    const box = document.createElement('div');
    box.id = 'sale_confirm_box';
    box.style.marginTop = '12px';
    card.appendChild(box);
  };

  const clearConfirmBox = () => {
    const box = el('sale_confirm_box');
    if(box) box.innerHTML = '';
  };

  const renderConfirmBox = ({ title, subtitle, planLines, onConfirm, onCancel }) => {
    ensureConfirmBox();
    const box = el('sale_confirm_box');
    if(!box) return;

    box.innerHTML = `
      <div style="
        border:1px solid rgba(255,255,255,.12);
        border-radius:14px;
        padding:12px;
        background:rgba(255,255,255,.04);
      ">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;">${title}</div>
            <div class="muted" style="margin-top:4px;">${subtitle || ''}</div>
          </div>
          <button type="button" id="sale_confirm_close" class="btn-secondary"
            style="border-radius:999px;padding:6px 10px;">✕</button>
        </div>

        <div style="margin-top:10px; display:grid; gap:6px;">
          ${(planLines || []).map(t => `
            <div style="
              padding:10px 12px;
              border-radius:12px;
              background:rgba(255,255,255,.06);
              border:1px solid rgba(255,255,255,.10);
            ">${t}</div>
          `).join('')}
        </div>

        <div style="display:flex; gap:10px; margin-top:12px;">
          <button type="button" id="sale_confirm_btn" class="btn-primary"
            style="flex:1; border-radius:12px;">Conferma vendita</button>
          <button type="button" id="sale_cancel_btn" class="btn-secondary"
            style="border-radius:12px;">Annulla</button>
        </div>
      </div>
    `;

    box.querySelector('#sale_confirm_btn')?.addEventListener('click', onConfirm);
    box.querySelector('#sale_cancel_btn')?.addEventListener('click', () => {
      clearConfirmBox();
      onCancel?.();
    });
    box.querySelector('#sale_confirm_close')?.addEventListener('click', () => {
      clearConfirmBox();
      onCancel?.();
    });
  };

  const selectedSum = () => {
    let s = 0;
    selectedLots.forEach(v => s += Number(v || 0));
    return s;
  };

  const remainingNeeded = () => Math.max(0, getQty() - selectedSum());

  const resetManualUI = () => {
    selectedLots.clear();
    if (el('sale_lot_chips')) el('sale_lot_chips').innerHTML = '';
    if (el('sale_selected_chips')) el('sale_selected_chips').innerHTML = '';
    if (el('sale_manual_status')) el('sale_manual_status').textContent = '';
  };

  const resetAllUI = () => {
    suggestedLots = [];
    resetManualUI();
    if (el('sale_plan_hint')) el('sale_plan_hint').textContent = '';
    clearConfirmBox();
  };

  const renderManualStatus = () => {
    const st = el('sale_manual_status');
    if (!st) return;

    const need = remainingNeeded();
    if (need === 0) st.textContent = '✅ OK: quantità completa. Ora premi “Registra Vendita”.';
    else st.textContent = `⏳ Mancano ${need}. Seleziona altri lotti.`;
  };

  // ------- CHIP UI (manuale) -------
  const chipStyle = `
    display:inline-flex;align-items:center;gap:8px;
    padding:8px 12px;border-radius:999px;
    border:1px solid rgba(255,255,255,0.12);
    background:rgba(255,255,255,0.06);
    cursor:pointer;user-select:none;
  `;
  const pillStyle = `
    padding:2px 8px;border-radius:999px;font-size:12px;
    background:rgba(0,0,0,0.18);
    border:1px solid rgba(255,255,255,0.10);
  `;
  const btnMini = `
    width:26px;height:26px;border-radius:999px;
    border:1px solid rgba(255,255,255,0.12);
    background:rgba(255,255,255,0.06);
    cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  `;

  const renderSuggestedChips = () => {
    const box = el('sale_lot_chips');
    if (!box) return;

    box.innerHTML = '';
    box.style.display = 'flex';
    box.style.flexWrap = 'wrap';
    box.style.gap = '8px';

    if (!suggestedLots.length) {
      const span = document.createElement('div');
      span.className = 'muted';
      span.textContent = 'Nessun lotto disponibile.';
      box.appendChild(span);
      return;
    }

    suggestedLots.forEach(l => {
      const available = Number(l.stock || 0);
      const already = Number(selectedLots.get(l.lot_id) || 0);
      const canAdd = Math.max(0, available - already);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.style.cssText = chipStyle + (canAdd <= 0 ? 'opacity:.45;cursor:not-allowed;' : '');

      const expTxt = l.expiration_date ? `Scad. ${formatDateIT(l.expiration_date)}` : 'Scad. —';
      chip.innerHTML = `
        <strong>${l.lot_number ?? ('lot#'+l.lot_id)}</strong>
        <span style="${pillStyle}">${available} disp.</span>
        <span style="font-size:12px;color:#94a3b8;">${expTxt}</span>
      `;

      chip.onclick = () => {
        if (canAdd <= 0) return;
        const need = remainingNeeded();
        if (need <= 0) return;

        const add = Math.min(canAdd, need);
        selectedLots.set(l.lot_id, already + add);

        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      };

      box.appendChild(chip);
    });
  };

  const renderSelectedChips = () => {
    const box = el('sale_selected_chips');
    if (!box) return;

    box.innerHTML = '';
    box.style.display = 'flex';
    box.style.flexWrap = 'wrap';
    box.style.gap = '8px';

    if (selectedLots.size === 0) {
      const span = document.createElement('div');
      span.className = 'muted';
      span.textContent = 'Nessun lotto selezionato.';
      box.appendChild(span);
      return;
    }

    selectedLots.forEach((qty, lot_id) => {
      const lot = suggestedLots.find(x => Number(x.lot_id) === Number(lot_id));
      const name = lot?.lot_number ?? ('lot#' + lot_id);
      const maxStock = Number(lot?.stock ?? qty);

      const chip = document.createElement('div');
      chip.style.cssText = chipStyle + 'cursor:default;background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.25);';

      const left = document.createElement('span');
      left.innerHTML = `<strong>${name}</strong> <span style="${pillStyle}">${qty}</span>`;

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';
      actions.style.marginLeft = '6px';

      const mkBtn = (txt, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = btnMini;
        b.textContent = txt;
        b.onclick = onClick;
        return b;
      };

      actions.appendChild(mkBtn('−', () => {
        const v = Number(selectedLots.get(lot_id) || 0);
        if (v <= 1) selectedLots.delete(lot_id);
        else selectedLots.set(lot_id, v - 1);
        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      }));

      actions.appendChild(mkBtn('+', () => {
        const need = remainingNeeded();
        if (need <= 0) return;
        const v = Number(selectedLots.get(lot_id) || 0);
        if (v >= maxStock) return;
        selectedLots.set(lot_id, v + 1);
        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      }));

      actions.appendChild(mkBtn('×', () => {
        selectedLots.delete(lot_id);
        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      }));

      chip.appendChild(left);
      chip.appendChild(actions);
      box.appendChild(chip);
    });
  };

  // ------- API -------
  const fetchSuggestedLots = async (product_id) => {
    const quantity = getQty();
    const res = await fetchJSON('api_sale_preview_v2.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'auto', product_id, quantity })
    });

    suggestedLots = res.suggested_lots || [];
  };

  const buildManualLotsPayload = () => {
    const lots = [];
    selectedLots.forEach((qty, lot_id) => {
      lots.push({ lot_id: Number(lot_id), qty: Number(qty) });
    });
    return lots;
  };

  const resolveProductForSale = async () => {
    const fs = document.getElementById('sale_prod_select');
    const selectedProductId = Number(fs?.value || 0);

    if (selectedProductId > 0) {
      const p = (PRODUCTS || []).find(x => Number(x.id) === selectedProductId) || null;
      if (!p) return { error: 'Prodotto selezionato non valido' };
      return p;
    }

    const code = el('barcode')?.value.trim() || '';
    if (!code) return { error: 'Seleziona prodotto/formato o inserisci EAN' };

    return await fetchProductByEAN(code);
  };

  const humanPlanLines = (plan=[]) => {
    return plan.map(x => {
      const qty = Number(x.qty ?? x.taken ?? 0);
      const lot = x.lot_number ?? ('lot#'+x.lot_id);
      const exp = x.expiration_date ? ` • scad ${formatDateIT(x.expiration_date)}` : '';
      return `Lotto <strong>${lot}</strong>${exp}: <strong>-${qty}</strong> barattoli`;
    });
  };

  // -------- AUTO (2 step) --------
  const doAuto = async () => {
    const quantity = getQty();

    const preview = await fetchJSON('api_sale_preview_v2.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'auto', product_id: currentProduct.id, quantity })
    });

    if (preview.success === false) {
      clearConfirmBox();
      setMsg('error', preview.error || 'Stock insufficiente');
      return;
    }

    const productLabel =
      `${currentProduct.name || ('Prodotto #' + currentProduct.id)}${currentProduct.format ? ` (${currentProduct.format})` : ''}`;

    const lines = humanPlanLines(preview.plan || []);
    if (el('sale_plan_hint')) el('sale_plan_hint').textContent = `Scarico automatico: ${lines.length} lotto/i`;

    const commitAndRefresh = async () => {
      const commit = await fetchJSON('api_sale_commit_v2.php', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ mode:'auto', product_id: currentProduct.id, quantity })
      });

      if (commit?.success === false || commit?.error) {
        setMsg('error', commit.available != null
          ? `Stock insufficiente: disponibili ${commit.available}. Riprova.`
          : (commit.detail ? `${commit.error}: ${commit.detail}` : (commit.error || 'Errore vendita')));
        return;
      }

      clearConfirmBox();
      setMsg('success', `✅ Vendita registrata: ${commit.sold} barattoli. Scaricato da: ${lines.map(l=>l.replace(/<[^>]*>/g,'')).join(' | ')}`);

      el('barcode').value = '';
      el('sale_qty').value = 1;
      resetAllUI();

      await loadHomeDashboard();
      await loadProductsTable();
      Cache.inventoryData = null;
      Cache.inventoryInsights = null;
      if(isTabActive('tab_inventory')) await loadInventoryTab();
      applyGlobalSearch();
    };

    if(SETTINGS.confirm_sale_before_commit){
      renderConfirmBox({
        title: `Stai per vendere ${quantity} barattoli`,
        subtitle: `Prodotto: ${productLabel}. Conferma per registrare la vendita.`,
        planLines: lines,
        onConfirm: commitAndRefresh,
        onCancel: () => setMsg('muted', 'Operazione annullata.')
      });
    } else {
      // no-confirm mode
      await commitAndRefresh();
    }
  };

  // -------- MANUAL (2 step + chip) --------
  const doManual = async () => {
    const quantity = getQty();

    if (selectedSum() !== quantity) {
      renderManualStatus();
      setMsg('error', `In manuale devi coprire tutta la quantità (${quantity}).`);
      return;
    }

    const lots = buildManualLotsPayload();

    const preview = await fetchJSON('api_sale_preview_v2.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'manual', product_id: currentProduct.id, quantity, lots })
    });

    if (preview.success === false) {
      setMsg('error', preview.error || 'Errore preview manuale');
      return;
    }

    const planLines = lots.map(x => {
      const lot = suggestedLots.find(s => Number(s.lot_id) === Number(x.lot_id));
      const lotLabel = lot?.lot_number ?? ('lot#'+x.lot_id);
      const exp = lot?.expiration_date ? ` • scad ${formatDateIT(lot.expiration_date)}` : '';
      return `Lotto <strong>${lotLabel}</strong>${exp}: <strong>-${x.qty}</strong> barattoli`;
    });

    const commitAndRefresh = async () => {
      const commit = await fetchJSON('api_sale_commit_v2.php', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ mode:'manual', product_id: currentProduct.id, quantity, lots })
      });

      if (commit.success === false || commit.error) {
        setMsg('error', commit.available != null
          ? `Stock insufficiente: disponibili ${commit.available}.`
          : (commit.detail ? `${commit.error}: ${commit.detail}` : (commit.error || 'Errore')));
        return;
      }

      clearConfirmBox();
      setMsg('success', `✅ Vendita manuale registrata: ${commit.sold} barattoli.`);

      el('barcode').value = '';
      el('sale_qty').value = 1;
      resetAllUI();

      await loadHomeDashboard();
      await loadProductsTable();
      Cache.inventoryData = null;
      Cache.inventoryInsights = null;
      if(isTabActive('tab_inventory')) await loadInventoryTab();
      applyGlobalSearch();
    };

    if(SETTINGS.confirm_sale_before_commit){
      renderConfirmBox({
        title: `Conferma vendita manuale (${quantity})`,
        subtitle: `Prodotto: ${currentProduct.name || ('Prodotto #' + currentProduct.id)}`,
        planLines,
        onConfirm: commitAndRefresh,
        onCancel: () => setMsg('muted', 'Operazione annullata.')
      });
    } else {
      await commitAndRefresh();
    }
  };

  const openManualBoxAndLoadLots = async () => {
    const manualBox = el('sale_manual_box');
    if (manualBox) manualBox.style.display = 'block';

    if (!currentProduct?.id) return;

    await fetchSuggestedLots(currentProduct.id);
    renderSuggestedChips();
    renderSelectedChips();
    renderManualStatus();
  };

  const closeManualBox = () => {
    const manualBox = el('sale_manual_box');
    if (manualBox) manualBox.style.display = 'none';
    resetManualUI();
  };

  const init = () => {
    const btn = el('btn_sale');
    const toggle = el('sale_manual_toggle');
    const saleFormat = el('sale_prod_select');
    const saleName = el('sale_product_name_select');

    ensureConfirmBox();

    // toggle manuale
    if (toggle) {
      toggle.addEventListener('change', async () => {
        clearConfirmBox();
        setMsg('', '');
        resetManualUI();

        if (isManual()) {
          await openManualBoxAndLoadLots();
        } else {
          closeManualBox();
        }
      });
    }

    // cambio prodotto/formato
    if (saleFormat) {
      saleFormat.addEventListener('change', async () => {
        const pid = Number(saleFormat.value || 0);
        currentProduct = pid ? (PRODUCTS || []).find(x => Number(x.id) === pid) || null : null;

        clearConfirmBox();
        setMsg('', '');
        resetManualUI();

        if (isManual() && currentProduct?.id) {
          await openManualBoxAndLoadLots();
        }
      });
    }

    // barcode scanner-friendly (safe, opzionale via settings)
    let barcodeTimer = null;
    el('barcode')?.addEventListener('input', () => {
      clearTimeout(barcodeTimer);
      const wait = SETTINGS.scanner_auto_submit_on_ean ? 40 : 180;
      barcodeTimer = setTimeout(async () => {
        const code = el('barcode')?.value.trim() || '';
        if (!code) return;

        const p = await fetchProductByEAN(code);
        if (p?.error || p?.success === false) {
          await scanFeedback(false);
          return;
        }

        await scanFeedback(true);

        currentProduct = p;

        if (saleName) {
          saleName.value = p.name;
          saleName.dispatchEvent(new Event('change'));
        }
        if (saleFormat) {
          saleFormat.value = String(p.id);
          saleFormat.dispatchEvent(new Event('change'));
        }

        if (isManual() && currentProduct?.id) {
          await openManualBoxAndLoadLots();
        }
      }, wait);
    });

    // qty cambia: se manuale ricalcola status e ricarica suggeriti
    el('sale_qty')?.addEventListener('input', async () => {
      clearConfirmBox();
      if (!isManual()) return;
      if (!currentProduct?.id) return;
      renderManualStatus();
      await fetchSuggestedLots(currentProduct.id);
      renderSuggestedChips();
      renderSelectedChips();
      renderManualStatus();
    });

    if (!btn) return;

    btn.onclick = async () => {
      btn.disabled = true;
      try {
        clearConfirmBox();
        setMsg('', '');

        const quantity = getQty();
        if (quantity <= 0) { setMsg('error', 'Quantità non valida.'); return; }

        const product = await resolveProductForSale();
        if (product?.error) { setMsg('error', product.error); return; }
        if (product?.success === false) { setMsg('error', product.error || 'Prodotto non trovato'); return; }

        currentProduct = product;

        if (isManual()) {
          await openManualBoxAndLoadLots();
          await doManual();
        } else {
          await doAuto();
        }
      } catch (err) {
        console.error(err);
        setMsg('error', 'Errore imprevisto');
      } finally {
        btn.disabled = false;
      }
    };

    window.__SALE_UI_READY = true;
  };

  return { init };
})();

// ==========================
// PRODOTTI TAB (render separato per filtro + highlight)
// ==========================
async function loadProductsTable(){
  const res = await fetchJSON('api_products_with_stock.php');

  // normalizza: accetta array puro oppure oggetto {rows:[...]}
  const rows = Array.isArray(res) ? res : (Array.isArray(res?.rows) ? res.rows : []);

  if(!Array.isArray(rows)){
    console.error('api_products_with_stock.php returned non-array:', res);
    return;
  }

  Cache.productsRows = rows;

  const tokens = tokenize(getGlobalQuery());
  renderProductsFromRows(rows, tokens);
}

function renderProductsFromRows(rows, tokens){
  const container = document.getElementById('products_container');
  if(!container) return;

  container.innerHTML = '';

  const visibleRows = (rows || [])
    .filter(p => SHOW_ARCHIVED_PRODUCTS ? true : Number(p.is_active ?? 1) === 1)
    .filter(p => {
      if(!tokens.length) return true;
      return matchesTokens(
        `${p.name||''} ${p.format||''} ${p.units_per_tray||''} ${p.ean||''} ${p.stock||''} ${Number(p.is_active??1)===0?'archiviato':''}`,
        tokens
      );
    });

  visibleRows.forEach(p=>{
    const imageSrc = p.image_path ? p.image_path : 'uploads/stock.jpg';
    const stockNum = Number(p.stock ?? 0);
    const low = SETTINGS.low_stock_alert_enabled && stockNum <= Number(SETTINGS.low_stock_threshold_units || 0);

    const card=document.createElement('div');
    card.className='product-card';
    card.dataset.id = p.id;

    card.innerHTML=`
      <div class="product-header">
        <img src="${imageSrc}" class="product-img">

        <div class="product-info">
          <div class="view-mode">
            <div class="product-name">
              ${highlightTextRaw(p.name, tokens)}
              ${Number(p.is_active ?? 1) === 0
                ? `<span style="
                    margin-left:8px;
                    font-size:11px;
                    padding:2px 8px;
                    border-radius:999px;
                    background:#ef4444;
                    color:white;
                  ">ARCHIVIATO</span>`
                : ''}
            </div>
            <div class="product-meta">Formato: ${highlightTextRaw(p.format || '', tokens)}</div>
            <div class="product-meta">
              Unità per vassoio: <strong>${highlightTextRaw(String(p.units_per_tray ?? ''), tokens)}</strong>
            </div>
            <div class="product-meta">EAN: ${highlightTextRaw(p.ean || '', tokens)}</div>
          </div>

          <div class="edit-mode hidden">
            <input class="edit-name" value="${escapeHtml(p.name)}">
            <input class="edit-format" value="${escapeHtml(p.format || '')}">
            <input class="edit-units" type="number" value="${Number(p.units_per_tray||0)}" min="1">
          </div>
        </div>
      </div>

      <div class="product-stock">
        Stock totale: ${highlightTextRaw(String(stockNum), tokens)} barattoli
        ${low ? `<span class="pill-mini pill-low" style="margin-left:10px;">⚠️ basso</span>` : ''}
      </div>

      <div class="product-actions view-mode">
        <button class="btn-small btn-edit">Modifica</button>

        <button class="btn-small btn-danger btn-delete">
          ${Number(p.is_active ?? 1) === 1 ? 'Archivia' : 'Elimina definitivamente'}
        </button>

        ${Number(p.is_active ?? 1) === 0
          ? `<button class="btn-small btn-restore">Riattiva</button>`
          : ''
        }
      </div>

      <div class="product-actions edit-mode hidden">
        <button class="btn-small btn-save">Salva</button>
        <button class="btn-small btn-cancel">Annulla</button>
      </div>
    `;

    const editBtn = card.querySelector('.btn-edit');
    const deleteBtn = card.querySelector('.btn-delete');
    const restoreBtn = card.querySelector('.btn-restore');
    const saveBtn = card.querySelector('.btn-save');
    const cancelBtn = card.querySelector('.btn-cancel');

    const viewModes = card.querySelectorAll('.view-mode');
    const editModes = card.querySelectorAll('.edit-mode');

    editBtn.addEventListener('click', ()=>{
      card.classList.add('editing');
      viewModes.forEach(el=>el.classList.add('hidden'));
      editModes.forEach(el=>el.classList.remove('hidden'));
    });

    restoreBtn?.addEventListener('click', async ()=>{
      const res = await fetchJSON('api_restore_product.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:p.id })
      });

      if(res?.error){
        alert(res.error);
        return;
      }

      await loadProducts();
      await loadProductsTable();
      applyGlobalSearch();
    });

    cancelBtn.addEventListener('click', ()=>{
      card.classList.remove('editing');
      editModes.forEach(el=>el.classList.add('hidden'));
      viewModes.forEach(el=>el.classList.remove('hidden'));
    });

    saveBtn.addEventListener('click', async ()=>{
      const newName = card.querySelector('.edit-name').value.trim();
      const newFormat = card.querySelector('.edit-format').value.trim();
      const newUnits = parseInt(card.querySelector('.edit-units').value,10);

      if(!newName || newUnits <= 0){
        alert("Dati non validi");
        return;
      }

      const res = await fetchJSON('api_update_product.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          id:p.id,
          name:newName,
          format:newFormat,
          units:newUnits
        })
      });

      if(res?.error){
        alert(res.error);
        return;
      }

      card.classList.remove('editing');
      card.classList.add('saved');

      setTimeout(()=>{ card.classList.remove('saved'); },600);

      await loadProducts();
      await loadProductsTable();
      applyGlobalSearch();
    });

    deleteBtn.addEventListener('click', async () => {

      const isArchived = Number(p.is_active ?? 1) === 0;

      const question = isArchived
        ? "Eliminare DEFINITIVAMENTE il prodotto?\n(se ha movimenti/lotti verrà solo mantenuto archiviato)"
        : "Archiviare il prodotto?";

      if (!confirm(question)) return;

      const res = await fetchJSON('api_delete_product.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id })
      });

      if (res?.success === false) {
        alert(res.error || 'Errore eliminazione');
        return;
      }
      if (res?.error) {
        alert(res.error);
        return;
      }

      if (res?.mode === 'soft') {
        alert(isArchived
          ? '⚠ Non posso eliminare definitivamente: ha lotti/movimenti. Rimane archiviato.'
          : '✅ Prodotto archiviato.'
        );
      } else if (res?.mode === 'hard') {
        alert('✅ Prodotto eliminato definitivamente.');
      } else {
        alert('✅ Operazione completata.');
      }

      await loadProducts();
      await loadProductsTable();
      applyGlobalSearch();
    });

    container.appendChild(card);
  });

  if(visibleRows.length === 0){
    container.innerHTML = `<div class="muted">Nessun risultato</div>`;
  }
}

// ---------- RETTIFICHE (ADJUSTMENT) ----------
let ADJUST_TAB_READY = false;

async function loadAdjustTab(){

  const lotSelect = document.getElementById('adjust_lot');
  const qtyInput = document.getElementById('adjust_qty');
  const dirOut = document.getElementById('adjust_dir_out');
  const reasonSelect = document.getElementById('adjust_reason');
  const noteInput = document.getElementById('adjust_note');
  const btn = document.getElementById('btn_adjust_commit');
  const msg = document.getElementById('adjust_message');
  const stockBadge = document.getElementById('adjust_stock_badge');
  const tb = document.getElementById('adjust_table_body');

  if(!lotSelect || !tb) return;

  const lots = await fetchJSON('api_lots.php');
  const movements = await fetchJSON('api_movements.php');

  const stockByLot = new Map();

  movements.forEach(m=>{
    const id = Number(m.lot_id);
    if(!id) return;

    const prev = stockByLot.get(id) || 0;
    const qty = Number(m.quantity)||0;

    if(m.type === 'PRODUCTION') stockByLot.set(id, prev + qty);
    else if(m.type === 'SALE') stockByLot.set(id, prev - qty);
    else if(m.type === 'ADJUSTMENT') stockByLot.set(id, prev + qty);
  });

  const lotsWithStock = lots.map(l => ({
    ...l,
    stock: stockByLot.get(Number(l.lot_id)) || 0
  }));

  // cache per ricerca globale
  Cache.adjustLotsWithStock = lotsWithStock;
  Cache.adjustMovements = movements;

  lotSelect.innerHTML = '<option value="">Seleziona lotto…</option>';

  lotsWithStock.forEach(l=>{
    const opt = document.createElement('option');
    opt.value = l.lot_id;
    opt.textContent =
      `${l.product_name} • ${l.format} • Lotto ${l.lot_number} • Stock ${l.stock}`;
    opt.dataset.stock = l.stock;
    lotSelect.appendChild(opt);
  });

  lotSelect.addEventListener('change', ()=>{
    const opt = lotSelect.options[lotSelect.selectedIndex];
    stockBadge.textContent = opt?.dataset?.stock || 0;
  });

  if(!ADJUST_TAB_READY){
    btn.addEventListener('click', async ()=>{

      msg.className = 'message';
      msg.textContent = '';

      const lot_id = Number(lotSelect.value||0);
      const quantity = Number(qtyInput.value||0);
      const direction = dirOut?.checked ? 'OUT' : 'IN';
      const reason = reasonSelect.value;
      const note = noteInput.value;

      if(!lot_id || quantity<=0){
        msg.classList.add('error');
        msg.textContent = 'Dati non validi.';
        return;
      }

      const res = await fetchJSON('api_adjust_stock.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          lot_id,
          quantity,
          direction,
          reason,
          note
        })
      });

      if(!res.success){
        msg.classList.add('error');
        msg.textContent = res.error || 'Errore.';
        return;
      }

      msg.classList.add('success');
      msg.textContent = 'Rettifica registrata.';

      qtyInput.value='';
      noteInput.value='';

      await loadHomeDashboard();
      await loadAdjustTab();
      Cache.inventoryData = null;
      Cache.inventoryInsights = null;
      if(isTabActive('tab_inventory')) await loadInventoryTab();
      applyGlobalSearch();
    });

    ADJUST_TAB_READY = true;
  }

  // ✅ render tabella rettifiche usando cache + highlight
  renderAdjustmentsFromCache(tokenize(getGlobalQuery()));
}

function renderAdjustmentsFromCache(tokens){
  const tb = document.getElementById('adjust_table_body');
  if(!tb) return;

  const movements = Cache.adjustMovements || [];
  const lotsWithStock = Cache.adjustLotsWithStock || [];
  const lotMap = new Map(lotsWithStock.map(l=>[Number(l.lot_id),l]));

  const adjustmentsAll = movements
    .filter(m=>m.type==='ADJUSTMENT')
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));

  let adjustments = adjustmentsAll;

  if(tokens.length){
    adjustments = adjustmentsAll.filter(m=>{
      const lot = lotMap.get(Number(m.lot_id));
      const exp = lot?.expiration_date ? lot.expiration_date : '';
      const hay = `${m.created_at} ${m.quantity} ${m.reason||''} ${m.note||''} ${lot?.product_name||''} ${lot?.lot_number||''} ${exp} ${lot?.ean||''} ${lot?.format||''}`;
      return matchesTokens(hay, tokens);
    });
  }

  adjustments = adjustments.slice(0,30);

  tb.innerHTML = adjustments.map(m=>{
    const lot = lotMap.get(Number(m.lot_id));
    const exp = lot?.expiration_date
      ? formatDateIT(lot.expiration_date)
      : '—';

    const qty = Number(m.quantity)||0;
    const qDisp = qty<0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`;

    return `
      <tr>
        <td>${highlightTextRaw(formatDateIT(m.created_at), tokens)}</td>
        <td>${highlightTextRaw(lot?.product_name || '—', tokens)}</td>
        <td><strong>${highlightTextRaw(lot?.lot_number || '—', tokens)}</strong></td>
        <td>${highlightTextRaw(exp, tokens)}</td>
        <td style="font-weight:900;">${highlightTextRaw(qDisp, tokens)}</td>
        <td>${highlightTextRaw(m.reason || '—', tokens)}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="6" class="muted">Nessun risultato</td></tr>`;
}

// ==========================
// STOCK + LOTTI (già in cache Home)
// ==========================
function renderStockTableFromCache(tokens){
  const stockBody = document.querySelector('#stock_table tbody');
  if(!stockBody) return;

  const lotsWithStock = Cache.homeLotsWithStock || [];

  const stockByProduct = new Map();
  const infoByProduct = new Map();

  for(const l of lotsWithStock){
    const pid = Number(l.product_id);
    stockByProduct.set(pid, (stockByProduct.get(pid) || 0) + (Number(l.stock)||0));

    if(!infoByProduct.has(pid)){
      infoByProduct.set(pid, {
        fish_type: l.fish_type || '',
        name: l.product_name || '',
        format: l.format || '',
        ean: l.ean || ''
      });
    }
  }

  let rows = [...infoByProduct.entries()].map(([pid, info]) => ({
    ...info,
    stock: stockByProduct.get(pid) || 0
  }));

  if(tokens.length){
    rows = rows.filter(r => matchesTokens(
      `${r.fish_type} ${r.name} ${r.format} ${r.ean} ${r.stock}`,
      tokens
    ));
  }

  stockBody.innerHTML = rows.map(r => `
    <tr>
      <td>${highlightTextRaw(r.fish_type, tokens)}</td>
      <td>${highlightTextRaw(r.name, tokens)}</td>
      <td>${highlightTextRaw(r.format, tokens)}</td>
      <td>${highlightTextRaw(r.ean, tokens)}</td>
      <td>${highlightTextRaw(String(r.stock), tokens)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="muted">Nessun risultato</td></tr>`;
}

function renderLotsTableFromCache(tokens){
  const lotsBody = document.querySelector('#lots_table tbody');
  if(!lotsBody) return;

  const lotsWithStock = Cache.homeLotsWithStock || [];
  const today = new Date();

  let rows = [...lotsWithStock].sort((a,b)=> new Date(a.expiration_date) - new Date(b.expiration_date));

  if(tokens.length){
    rows = rows.filter(l => matchesTokens(
      `${l.fish_type} ${l.product_name} ${l.format} ${l.ean} ${l.lot_number} ${l.stock} ${l.production_date} ${l.expiration_date}`,
      tokens
    ));
  }

  lotsBody.innerHTML = '';

  if(rows.length === 0){
    lotsBody.innerHTML = `<tr><td colspan="8" class="muted">Nessun risultato</td></tr>`;
    return;
  }

  rows.forEach(l=>{
    const diffDays = Math.ceil((new Date(l.expiration_date) - today)/(1000*60*60*24));

    let bg = '';
    if(diffDays<=30) bg='#e84118';
    else if(diffDays<=90) bg='#fbc531';
    else bg='#44bd32';

    const tr = document.createElement('tr');
    tr.style.backgroundColor = bg;
    tr.style.color = 'white';

    tr.innerHTML = `
      <td>${highlightTextRaw(l.fish_type || '', tokens)}</td>
      <td>${highlightTextRaw(l.product_name || '', tokens)}</td>
      <td>${highlightTextRaw(l.format || '', tokens)}</td>
      <td>${highlightTextRaw(l.ean || '', tokens)}</td>
      <td>${highlightTextRaw(l.lot_number || '', tokens)}</td>
      <td>${highlightTextRaw(String(Number(l.stock)||0), tokens)}</td>
      <td>${highlightTextRaw(formatDateIT(l.production_date), tokens)}</td>
      <td>${highlightTextRaw(formatDateIT(l.expiration_date), tokens)}</td>
    `;
    lotsBody.appendChild(tr);
  });
}

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', async ()=>{

  // input ricerca globale (UNICO)
  const gs = document.getElementById('global_search');
  if(gs){
    let t = null;
    gs.addEventListener('input', ()=>{
      clearTimeout(t);
      t = setTimeout(applyGlobalSearch, 120);
    });
  }

  const clearBtn = document.getElementById('global_search_clear');
    if(clearBtn){
      clearBtn.addEventListener('click', ()=>{
        const gs = document.getElementById('global_search');
        if(gs){
          gs.value = '';
          applyGlobalSearch();
          gs.focus();
        }
      });
    }

  // toggle prodotti archiviati (UNICO)
  document
    .getElementById('toggle_archived_products')
    ?.addEventListener('change', (e)=>{
      SHOW_ARCHIVED_PRODUCTS = !!e.target.checked;
      // ricarico tab prodotti e poi riapplico filtro
      loadProductsTable().then(applyGlobalSearch);
    });

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if(!target) return;

      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab').forEach(tab=>{
        tab.classList.remove('active');
      });

      target.classList.add('active');

      // lazy-load tab content
      if(targetId === 'tab_adjust'){
        setTimeout(loadAdjustTab, 0);
      }

      if(targetId === 'tab_inventory'){ setTimeout(loadInventoryTab, 0); }

      if(targetId === 'tab_settings'){
        setTimeout(()=>{
          fillSettingsForm();
          const m = document.getElementById('settings_message');
          if(m){ m.className = 'muted'; m.textContent = ''; }
        }, 0);
      }
    });
  });

  lockLotFields();

  // settings prima di inizializzare le UI che dipendono da default (vendita/scadenze)
  await loadSettings();

  await loadProducts();
  SaleUI.init();

  await loadHomeDashboard();

  SHOW_ARCHIVED_PRODUCTS =
    document.getElementById('toggle_archived_products')?.checked === true;

  await loadProductsTable();
  await refreshTodayBatches();
  updateGlobalSearchHint();

  // settings: salva
  document.getElementById('btn_save_settings')?.addEventListener('click', saveSettingsFromForm);

  // applica ricerca (se già c'è testo dentro)
  applyGlobalSearch();

  // ---------- CREA PRODOTTO ----------
  document.getElementById('btn_add_product')?.addEventListener('click', async ()=>{

    const msg = document.getElementById('product_message');
    msg.className = 'message';
    msg.textContent = '';

    const name = document.getElementById('new_product_name').value.trim();
    const format = document.getElementById('new_product_format').value.trim();
    const fish_type = document.getElementById('new_product_fish').value.trim().toUpperCase();
    const ean = document.getElementById('new_product_ean').value.trim();
    const units = parseInt(document.getElementById('new_product_units').value, 10);
    const imageInput = document.getElementById('new_product_image');

    if(!name || !format || !fish_type || !ean || !units || units <= 0){
      msg.classList.add('error');
      msg.textContent = 'Compila tutti i campi obbligatori.';
      return;
    }

    try{
      const formData = new FormData();
      formData.append('name', name);
      formData.append('format', format);
      formData.append('fish_type', fish_type);
      formData.append('ean', ean);
      formData.append('units_per_tray', units);

      if(imageInput.files.length > 0){
        formData.append('image', imageInput.files[0]);
      }

      const res = await fetch('api_create_product.php', {
        method:'POST',
        body: formData
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch(e){
        console.error(text);
        msg.classList.add('error');
        msg.textContent = 'Errore server (vedi console).';
        return;
      }

      if(data.error){
        msg.classList.add('error');
        msg.textContent = data.error;
        return;
      }

      msg.classList.add('success');
      msg.textContent = 'Prodotto creato con successo.';

      document.getElementById('new_product_name').value = '';
      document.getElementById('new_product_format').value = '';
      document.getElementById('new_product_ean').value = '';
      document.getElementById('new_product_units').value = '';
      imageInput.value = '';

      await loadProducts();
      await loadProductsTable();
      applyGlobalSearch();

    }catch(err){
      console.error(err);
      msg.classList.add('error');
      msg.textContent = 'Errore creazione prodotto.';
    }
  });

  const lotInput = document.getElementById('lot_number');
  const formatSelect = document.getElementById('prod_select');

  lotInput?.addEventListener('input', async (e)=>{
    await checkBatchWarning(e.target.value.trim());
  });

  if(lotInput){
    lotInput.disabled = true;
    lotInput.style.background = '#eee';
  }

  if(formatSelect){
    formatSelect.addEventListener('change', ()=>{
      if(formatSelect.value){
        lotInput.disabled = false;
        lotInput.style.background = '';
      } else {
        lotInput.disabled = true;
        lotInput.value = '';
        lotInput.style.background = '#eee';
      }
    });
  }

  const eanInput = document.getElementById('prod_ean');
  if(eanInput){

    let timeout = null;

    eanInput.addEventListener('input', (e)=>{

      clearTimeout(timeout);

      const wait = SETTINGS.scanner_auto_submit_on_ean ? 40 : 300;
      timeout = setTimeout(async ()=>{

        const code = e.target.value.trim();

        if(!code){
          lockLotFields();
          return;
        }

        const product = await fetchProductByEAN(code);

        if(product.error){
          await scanFeedback(false);
          lockLotFields();
          return;
        }

        await scanFeedback(true);

        const nameSelect = document.getElementById('product_name_select');
        const formatSelect = document.getElementById('prod_select');

        nameSelect.value = product.name;
        nameSelect.dispatchEvent(new Event('change'));

        formatSelect.value = product.id;
        formatSelect.dispatchEvent(new Event('change'));

        unlockLotFields();
        await refreshTodayBatches();

      }, wait);

    });
  }

  // init quick-actions modal handlers (safe even if modal HTML not present)
  initQuickActionsModal();
});

// ==========================
// INVENTORY (MAGAZZINO)
// ==========================
let INVENTORY_READY = false;
let INVENTORY_VIEW = 'products'; // 'products' | 'lots'
let INVENTORY_TABLE_PAGE = 1;
const INVENTORY_TABLE_PER_PAGE = 5;
let INVENTORY_TABLE_LAST_Q = '';


// Movimenti (tab_inventory) - paginazione
let INVENTORY_MOVES_PAGE = 1;
          INVENTORY_TABLE_PAGE = 1;
const INVENTORY_MOVES_PER_PAGE = 10;
let INVENTORY_MOVES_READY = false;

async function loadInventoryTab(){
  try{
    const days = Number(document.getElementById('inv_days_filter')?.value || 0);

    // usa cache se già presente (così ricerca globale non rifà API)
    let inv = Cache.inventoryData;
    let ins = Cache.inventoryInsights;

    if(!inv || !ins){
      const res = await Promise.all([
        fetchJSON('api_inventory.php?days=' + encodeURIComponent(days)),
        fetchJSON('api_inventory_insights.php')
      ]);
      inv = res[0];
      ins = res[1];
      Cache.inventoryData = inv;
      Cache.inventoryInsights = ins;
    }

    if(inv?.success === false) throw new Error(inv.error || 'Errore api_inventory');
    if(ins?.success === false) throw new Error(ins.error || 'Errore api_inventory_insights');

    renderInventoryFromCache(tokenize(getGlobalQuery()));

    // init listeners una volta sola
    if(!INVENTORY_READY){
      const daysSel = document.getElementById('inv_days_filter');
      if(daysSel){
        daysSel.addEventListener('change', async ()=>{
          // reset cache perché cambia dataset
          Cache.inventoryData = null;
          Cache.inventoryInsights = null;
          INVENTORY_MOVES_PAGE = 1;
          INVENTORY_TABLE_PAGE = 1;
          await loadInventoryTab();
          applyGlobalSearch();
        });
      }

      document.getElementById('inv_view_products')?.addEventListener('click', ()=>{
        INVENTORY_VIEW = 'products';
        INVENTORY_TABLE_PAGE = 1;
        document.getElementById('inv_view_products')?.classList.add('active');
        document.getElementById('inv_view_lots')?.classList.remove('active');
        renderInventoryFromCache(tokenize(getGlobalQuery()));
      });

      document.getElementById('inv_view_lots')?.addEventListener('click', ()=>{
        INVENTORY_VIEW = 'lots';
        INVENTORY_TABLE_PAGE = 1;
        document.getElementById('inv_view_lots')?.classList.add('active');
        document.getElementById('inv_view_products')?.classList.remove('active');
        renderInventoryFromCache(tokenize(getGlobalQuery()));
      });

      // event delegation per bottoni azioni (evita duplicazioni)
      document.getElementById('inv_tbody')?.addEventListener('click', (e)=>{
        const btn = e.target?.closest?.('button[data-qa]');
        if(!btn) return;
        handleQuickAction(btn.dataset);
      });

      document.getElementById('inv_mobile_cards')?.addEventListener('click', (e)=>{
        const btn = e.target?.closest?.('button[data-qa]');
        if(!btn) return;
        handleQuickAction(btn.dataset);
      });

      

// tabella (prodotti/lotti) paginata (prev/next) - init una volta
if(!window.__INV_TABLE_PAGER_READY){
  const prevT = document.getElementById('inv_table_prev');
  const nextT = document.getElementById('inv_table_next');

  prevT?.addEventListener('click', ()=>{
    INVENTORY_TABLE_PAGE = Math.max(1, INVENTORY_TABLE_PAGE - 1);
    renderInventoryFromCache(tokenize(getGlobalQuery()));
  });
  nextT?.addEventListener('click', ()=>{
    INVENTORY_TABLE_PAGE = INVENTORY_TABLE_PAGE + 1; // clamp in render
    renderInventoryFromCache(tokenize(getGlobalQuery()));
  });

  window.__INV_TABLE_PAGER_READY = true;
}

// movimenti paginati (prev/next) - init una volta
if(!INVENTORY_MOVES_READY){
  const prevBtn = document.getElementById('inv_moves_prev');
  const nextBtn = document.getElementById('inv_moves_next');

  prevBtn?.addEventListener('click', ()=>{
    INVENTORY_MOVES_PAGE = Math.max(1, INVENTORY_MOVES_PAGE - 1);
    renderInventoryAllMovesFromCache(tokenize(getGlobalQuery()));
  });
  nextBtn?.addEventListener('click', ()=>{
    INVENTORY_MOVES_PAGE = INVENTORY_MOVES_PAGE + 1; // clamp in render
    renderInventoryAllMovesFromCache(tokenize(getGlobalQuery()));
  });

  INVENTORY_MOVES_READY = true;
}

INVENTORY_READY = true;
    }
  } catch(e){
    console.error(e);
    const el = document.getElementById('inv_todo');
    if(el) el.innerHTML = `<span class="muted">Errore caricamento Magazzino (vedi console).</span>`;
  }
}

function renderInventoryFromCache(tokens){
  const inv = Cache.inventoryData;
  const ins = Cache.inventoryInsights;
  if(!inv || !ins) return;
  const q = (tokens || []).join(' ').trim();
  if(q !== INVENTORY_TABLE_LAST_Q){
    INVENTORY_TABLE_PAGE = 1;
    INVENTORY_TABLE_LAST_Q = q;
  }


  // KPI filtrati dalla ricerca globale (per coerenza col resto)
  const lotsFilteredForKpi = (inv.lots_view || []).filter(r =>
    !tokens.length || matchesTokens(`${r.fish_type} ${r.product_name} ${r.format} ${r.ean} ${r.lot_number}`, tokens)
  );

  const totalStock = lotsFilteredForKpi.reduce((s,r)=> s + Math.max(0, Number(r.stock)||0), 0);
  const kTotal = document.getElementById('inv_kpi_total_stock');
  if(kTotal) kTotal.innerText = totalStock;

  const exp7All = (ins.expiring_7d || []);
  const exp30All = (ins.expiring_30d || []);

  const exp7 = exp7All.filter(x =>
    !tokens.length || matchesTokens(`${x.product_name} ${x.format} ${x.fish_type} ${x.ean} ${x.lot_number}`, tokens)
  );
  const exp30 = exp30All.filter(x =>
    !tokens.length || matchesTokens(`${x.product_name} ${x.format} ${x.fish_type} ${x.ean} ${x.lot_number}`, tokens)
  );

  const k7 = document.getElementById('inv_kpi_exp7');
  const k30 = document.getElementById('inv_kpi_exp30');
  if(k7) k7.innerText = exp7.length;
  if(k30) k30.innerText = exp30.length;

  // TODO “cose da fare” = top 6 scadenze 7gg (filtrate)
  const todoEl = document.getElementById('inv_todo');
  if(todoEl){
    const exp7Top = exp7.slice(0,6);
    todoEl.innerHTML = exp7Top.length
      ? exp7Top.map(x => `⚠️ <b>${highlightTextRaw(x.product_name, tokens)}</b> • Lotto <b>${highlightTextRaw(x.lot_number, tokens)}</b> • Stock <b>${x.stock}</b> • Scade <b>${highlightTextRaw(formatDateIT(x.expiration_date), tokens)}</b>`).join('<br>')
      : `<span class="muted">Niente di urgente (≤7gg) 🎉</span>`;
  }

  // Runout forecast (filtrato)
  const runoutEl = document.getElementById('inv_runout');
  if(runoutEl){
    const run = (ins.runout_forecast || []).filter(x =>
      !tokens.length || matchesTokens(`${x.product_name} ${x.format} ${x.fish_type} ${x.ean}`, tokens)
    ).slice(0,6);
    runoutEl.innerHTML = run.length
      ? run.map(x => `⏳ <b>${highlightTextRaw(x.product_name, tokens)}</b> • ${highlightTextRaw(x.format||'', tokens)} • ~<b>${x.days_left} giorni</b> • stock ${x.stock_total}`).join('<br>')
      : `<span class="muted">Nessuna previsione (poche vendite recenti).</span>`;
  }

  // Tabella principale
  if(INVENTORY_VIEW === 'lots') renderInventoryLots(inv.lots_view || [], tokens);
  else renderInventoryProducts(inv.products_agg || [], tokens);

  // Movimenti (tutti) con paginazione - usa cache Home
  renderInventoryAllMovesFromCache(tokens);
}


function updateInventoryTablePager(total){
  const countEl = document.getElementById('inv_table_count');
  const pageEl  = document.getElementById('inv_table_page');
  const prevBtn = document.getElementById('inv_table_prev');
  const nextBtn = document.getElementById('inv_table_next');

  const pages = Math.max(1, Math.ceil(total / INVENTORY_TABLE_PER_PAGE));
  if(INVENTORY_TABLE_PAGE > pages) INVENTORY_TABLE_PAGE = pages;
  if(INVENTORY_TABLE_PAGE < 1) INVENTORY_TABLE_PAGE = 1;

  const start = total === 0 ? 0 : ((INVENTORY_TABLE_PAGE - 1) * INVENTORY_TABLE_PER_PAGE) + 1;
  const end   = Math.min(total, INVENTORY_TABLE_PAGE * INVENTORY_TABLE_PER_PAGE);

  if(countEl) countEl.textContent = `${start}-${end} di ${total}`;
  if(pageEl)  pageEl.textContent  = `${INVENTORY_TABLE_PAGE}/${pages}`;

  if(prevBtn) prevBtn.disabled = (INVENTORY_TABLE_PAGE <= 1);
  if(nextBtn) nextBtn.disabled = (INVENTORY_TABLE_PAGE >= pages);
}

function renderInventoryProducts(rows, tokens){
  const thead = document.getElementById('inv_thead');
  const tbody = document.getElementById('inv_tbody');
  if(!thead || !tbody) return;

  const mobileC = document.getElementById('inv_mobile_cards');
  if(mobileC) mobileC.innerHTML = '';


  document.getElementById('inv_table_title').textContent = 'Vista per prodotto';

  thead.innerHTML = `
    <tr>
      <th>Prodotto</th>
      <th>Stock &amp; FEFO</th>
      <th style="text-align:right;">Azioni</th>
    </tr>
  `;



  // Mobile: lista card (niente tabella scroll infinita)
  if(isMobile()){
    const container = document.getElementById('inv_mobile_cards');
    if(container){
      const filtered = (rows||[]).filter(r => {
        if(!tokens.length) return true;
        const stockTotal = (r.stock_total ?? r.total_stock ?? 0);
        const fefoLot = (r.fefo_lot_number ?? r.fefo_lot ?? '');
        const fefoDate = (r.fefo_expiration_date ?? r.fefo_date ?? '');
        return matchesTokens(`${r.fish_type} ${r.product_name} ${r.format} ${r.ean} ${stockTotal} ${r.lots_count} ${fefoLot} ${fefoDate}`, tokens);
      });

      const total = filtered.length;
      updateInventoryTablePager(total);

      const startIdx = (INVENTORY_TABLE_PAGE - 1) * INVENTORY_TABLE_PER_PAGE;
      const pageRows = filtered.slice(startIdx, startIdx + INVENTORY_TABLE_PER_PAGE);

      const today = new Date();
      const expClass = (iso) => {
        if(!iso) return 'pill-exp';
        const d = new Date(iso);
        if(isNaN(d)) return 'pill-exp';
        const diff = Math.ceil((d - today) / (1000*60*60*24));
        if(diff <= 30) return 'pill-exp danger';
        return 'pill-exp ok';
      };

      renderMobileCards(container, pageRows.map(r => {
        const prodName = highlightTextRaw(r.product_name||'—', tokens);
        const fish = highlightTextRaw(r.fish_type||'—', tokens);
        const fmt = highlightTextRaw(r.format||'—', tokens);
        const ean = highlightTextRaw(r.ean||'—', tokens);

        const stock = Number(r.stock_total ?? r.total_stock ?? 0);
        const low = SETTINGS.low_stock_alert_enabled && stock <= Number(SETTINGS.low_stock_threshold_units||0);
        const lotsCount = Number(r.lots_count||0);
        const fefoLot = highlightTextRaw((r.fefo_lot_number ?? r.fefo_lot) || '—', tokens);
        const fefoIso = (r.fefo_expiration_date ?? r.fefo_date) || '';
        const fefoDate = highlightTextRaw(fefoIso ? formatDateIT(fefoIso) : '—', tokens);

        return {
          title: `${prodName} ${fmt ? '• ' + fmt : ''}`,
          lines: [
            `<span class="pill-mini">${fish}</span> <span class="pill-mini">EAN <strong>${ean}</strong></span>`,
            `<span class="pill-mini pill-stock">Stock <strong>${stock}</strong></span> <span class="pill-mini">Lotti <strong>${lotsCount}</strong></span> ${low ? `<span class="pill-mini pill-low">⚠️ basso</span>` : ''}`,
            `<span class="pill-mini">FEFO <strong>${fefoLot}</strong></span> <span class="pill-mini ${expClass(fefoIso)}">Scad. <strong>${fefoDate}</strong></span>`,
            `<div class="mcard-actions">
              <button type="button" class="qa-btn" data-qa="prod" data-product="${Number(r.product_id||0)}">Produci</button>
              <button type="button" class="qa-btn primary" data-qa="sale" data-product="${Number(r.product_id||0)}">Vendi</button>
            </div>`
          ],
          right: null
        };
      }));

      // pulisci tabella desktop per evitare contenuti doppi (anche se nascosta)
      tbody.innerHTML = '';
    }
    return;
  }

  const filtered = (rows||[]).filter(r => {
    if(!tokens.length) return true;
    const stockTotal = (r.stock_total ?? r.total_stock ?? 0);
    const fefoLot = (r.fefo_lot_number ?? r.fefo_lot ?? '');
    const fefoDate = (r.fefo_expiration_date ?? r.fefo_date ?? '');
    return matchesTokens(`${r.fish_type} ${r.product_name} ${r.format} ${r.ean} ${stockTotal} ${r.lots_count} ${fefoLot} ${fefoDate}`, tokens);
  });

  const total = filtered.length;
  updateInventoryTablePager(total);

  const startIdx = (INVENTORY_TABLE_PAGE - 1) * INVENTORY_TABLE_PER_PAGE;
  const pageRows = filtered.slice(startIdx, startIdx + INVENTORY_TABLE_PER_PAGE);

  const today = new Date();
  const expClass = (iso) => {
    if(!iso) return 'pill-exp';
    const d = new Date(iso);
    if(isNaN(d)) return 'pill-exp';
    const diff = Math.ceil((d - today) / (1000*60*60*24));
    if(diff <= 30) return 'pill-exp danger';
    return 'pill-exp ok';
  };

  tbody.innerHTML = pageRows.map(r => {
    const prodName = highlightTextRaw(r.product_name||'—', tokens);
    const fish = highlightTextRaw(r.fish_type||'—', tokens);
    const fmt = highlightTextRaw(r.format||'—', tokens);
    const ean = highlightTextRaw(r.ean||'—', tokens);

    const stock = Number(r.stock_total ?? r.total_stock ?? 0);
    const low = SETTINGS.low_stock_alert_enabled && stock <= Number(SETTINGS.low_stock_threshold_units||0);
    const lotsCount = Number(r.lots_count||0);
    const fefoLot = highlightTextRaw((r.fefo_lot_number ?? r.fefo_lot) || '—', tokens);
    const fefoIso = (r.fefo_expiration_date ?? r.fefo_date) || '';
    const fefoDate = highlightTextRaw(fefoIso ? formatDateIT(fefoIso) : '—', tokens);

    return `
      <tr>
        <td>
          <div class="inv-cell-title">${prodName}</div>
          <div class="inv-cell-sub">
            <span class="pill-mini">${fish}</span>
            <span class="pill-mini">${fmt}</span>
            <span class="pill-mini">EAN&nbsp;<strong>${ean}</strong></span>
          </div>
        </td>

        <td>
          <div class="inv-cell-sub" style="margin-top:0;">
            <span class="pill-mini pill-stock">Stock&nbsp;<strong>${stock}</strong></span>
            ${low ? `<span class="pill-mini pill-low">⚠️ basso</span>` : ''}
            <span class="pill-mini">Lotti&nbsp;<strong>${lotsCount}</strong></span>
          </div>
          <div class="inv-cell-sub" style="margin-top:8px;">
            <span class="pill-mini">FEFO&nbsp;<strong>${fefoLot}</strong></span>
            <span class="pill-mini ${expClass(fefoIso)}">Scad.&nbsp;<strong>${fefoDate}</strong></span>
          </div>
        </td>

        <td class="inv-actions" style="text-align:right;">
          <button type="button" class="qa-btn" data-qa="prod" data-product="${Number(r.product_id||0)}">Produci</button>
          <button type="button" class="qa-btn primary" data-qa="sale" data-product="${Number(r.product_id||0)}">Vendi</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="3">Nessun risultato</td></tr>`;
}


function renderInventoryLots(rows, tokens){
  const thead = document.getElementById('inv_thead');
  const tbody = document.getElementById('inv_tbody');
  if(!thead || !tbody) return;

  const mobileC = document.getElementById('inv_mobile_cards');
  if(mobileC) mobileC.innerHTML = '';


  document.getElementById('inv_table_title').textContent = 'Vista per lotto';

  thead.innerHTML = `
    <tr>
      <th>Lotto</th>
      <th>Stock &amp; Date</th>
      <th style="text-align:right;">Azioni</th>
    </tr>
  `;



  // Mobile: lista card (niente tabella scroll infinita)
  if(isMobile()){
    const container = document.getElementById('inv_mobile_cards');
    if(container){
      const filtered = (rows||[]).filter(r => {
        if(!tokens.length) return true;
        return matchesTokens(`${r.fish_type} ${r.product_name} ${r.format} ${r.ean} ${r.lot_number} ${r.stock} ${r.production_date||''} ${r.expiration_date||''}`, tokens);
      });

      const total = filtered.length;
      updateInventoryTablePager(total);

      const startIdx = (INVENTORY_TABLE_PAGE - 1) * INVENTORY_TABLE_PER_PAGE;
      const pageRows = filtered.slice(startIdx, startIdx + INVENTORY_TABLE_PER_PAGE);

      const today = new Date();
      const expClass = (iso) => {
        if(!iso) return 'pill-exp';
        const d = new Date(iso);
        if(isNaN(d)) return 'pill-exp';
        const diff = Math.ceil((d - today) / (1000*60*60*24));
        if(diff <= 30) return 'pill-exp danger';
        return 'pill-exp ok';
      };

      renderMobileCards(container, pageRows.map(r => {
        const lotNumber = highlightTextRaw(r.lot_number||'—', tokens);
        const prodName = highlightTextRaw(r.product_name||'—', tokens);
        const fish = highlightTextRaw(r.fish_type||'—', tokens);
        const fmt = highlightTextRaw(r.format||'—', tokens);
        const ean = highlightTextRaw(r.ean||'—', tokens);
        const stock = highlightTextRaw(String(r.stock||0), tokens);
        const prodDate = highlightTextRaw(r.production_date ? formatDateIT(r.production_date) : '—', tokens);
        const expIso = r.expiration_date || '';
        const expDate = highlightTextRaw(expIso ? formatDateIT(expIso) : '—', tokens);

        return {
          title: `Lotto ${lotNumber}`,
          lines: [
            `<span class="pill-mini">${prodName}</span> <span class="pill-mini">${fish}</span> <span class="pill-mini">${fmt}</span> <span class="pill-mini">EAN <strong>${ean}</strong></span>`,
            `<span class="pill-mini pill-stock">Stock <strong>${stock}</strong></span>`,
            `<span class="pill-mini">Prod. <strong>${prodDate}</strong></span> <span class="pill-mini ${expClass(expIso)}">Scad. <strong>${expDate}</strong></span>`,
            `<div class="mcard-actions">
              <button type="button" class="qa-btn" data-qa="adj" data-lot="${Number(r.lot_id||0)}">Rettifica</button>
              <button type="button" class="qa-btn primary" data-qa="sale_lot" data-product="${Number(r.product_id||0)}" data-lot="${Number(r.lot_id||0)}">Vendi lotto</button>
            </div>`
          ],
          right: null
        };
      }));

      tbody.innerHTML = '';
    }
    return;
  }

  const filtered = (rows||[]).filter(r => {
    if(!tokens.length) return true;
    return matchesTokens(`${r.fish_type} ${r.product_name} ${r.format} ${r.ean} ${r.lot_number} ${r.stock} ${r.production_date||''} ${r.expiration_date||''}`, tokens);
  });

  const total = filtered.length;
  updateInventoryTablePager(total);

  const startIdx = (INVENTORY_TABLE_PAGE - 1) * INVENTORY_TABLE_PER_PAGE;
  const pageRows = filtered.slice(startIdx, startIdx + INVENTORY_TABLE_PER_PAGE);

  const today = new Date();
  const expClass = (iso) => {
    if(!iso) return 'pill-exp';
    const d = new Date(iso);
    if(isNaN(d)) return 'pill-exp';
    const diff = Math.ceil((d - today) / (1000*60*60*24));
    if(diff <= 30) return 'pill-exp danger';
    return 'pill-exp ok';
  };

  tbody.innerHTML = pageRows.map(r => {
    const lotNumber = highlightTextRaw(r.lot_number||'—', tokens);
    const prodName = highlightTextRaw(r.product_name||'—', tokens);
    const fish = highlightTextRaw(r.fish_type||'—', tokens);
    const fmt = highlightTextRaw(r.format||'—', tokens);
    const ean = highlightTextRaw(r.ean||'—', tokens);
    const stock = highlightTextRaw(String(r.stock||0), tokens);
    const prodDate = highlightTextRaw(r.production_date ? formatDateIT(r.production_date) : '—', tokens);
    const expIso = r.expiration_date || '';
    const expDate = highlightTextRaw(expIso ? formatDateIT(expIso) : '—', tokens);

    return `
      <tr>
        <td>
          <div class="inv-cell-title">${lotNumber}</div>
          <div class="inv-cell-sub">
            <span class="pill-mini">${prodName}</span>
            <span class="pill-mini">${fish}</span>
            <span class="pill-mini">${fmt}</span>
            <span class="pill-mini">EAN&nbsp;<strong>${ean}</strong></span>
          </div>
        </td>

        <td>
          <div class="inv-cell-sub" style="margin-top:0;">
            <span class="pill-mini pill-stock">Stock&nbsp;<strong>${stock}</strong></span>
          </div>
          <div class="inv-cell-sub" style="margin-top:8px;">
            <span class="pill-mini">Prod.&nbsp;<strong>${prodDate}</strong></span>
            <span class="pill-mini ${expClass(expIso)}">Scad.&nbsp;<strong>${expDate}</strong></span>
          </div>
        </td>

        <td class="inv-actions" style="text-align:right;">
          <button type="button" class="qa-btn" data-qa="adj" data-lot="${Number(r.lot_id||0)}">Rettifica</button>
          <button type="button" class="qa-btn primary" data-qa="sale_lot" data-product="${Number(r.product_id||0)}" data-lot="${Number(r.lot_id||0)}">Vendi lotto</button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="3">Nessun risultato</td></tr>`;
}


// ==========================
// INVENTORY: MOVIMENTI (TUTTI) con paginazione
// - stessa UI della Home (tabella desktop + card mobile)
// - usa Cache.homeMovements + Cache.homeLotsWithStock (così lotto è sempre quello giusto)
// ==========================
function renderInventoryAllMovesFromCache(tokens){
  const movesTb = document.getElementById('inv_all_moves_table');
  if(!movesTb) return;

  const lotsWithStock = Cache.homeLotsWithStock || [];
  const movements = Cache.homeMovements || [];

  const lotById = new Map(lotsWithStock.map(l => [Number(l.lot_id), l]));

  const typeLabel = (t) =>
    t === 'SALE' ? 'Vendita' :
    (t === 'PRODUCTION' ? 'Produzione' :
    (t === 'ADJUSTMENT' ? 'Rettifica' : t));

  const sortedAll = [...movements].sort((a,b)=>{
    const da = new Date((a.created_at||'').replace(' ', 'T'));
    const db = new Date((b.created_at||'').replace(' ', 'T'));
    return db - da;
  });

  // filtro globale (stesso haystack della Home)
  let filtered = sortedAll;
  if(tokens && tokens.length){
    filtered = sortedAll.filter(m=>{
      const lot = lotById.get(Number(m.lot_id)) || null;
      const hay =
        `${m.created_at} ${m.type} ${m.reason||''} ${m.note||''} ${m.quantity||''} `+
        `${lot?.fish_type||''} ${lot?.product_name||''} ${lot?.format||''} ${lot?.ean||''} ${lot?.lot_number||''} ${lot?.expiration_date||''}`;
      return matchesTokens(hay, tokens);
    });
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / INVENTORY_MOVES_PER_PAGE));

  // clamp pagina
  INVENTORY_MOVES_PAGE = Math.min(Math.max(1, INVENTORY_MOVES_PAGE), totalPages);

  const start = (INVENTORY_MOVES_PAGE - 1) * INVENTORY_MOVES_PER_PAGE;
  const pageRows = filtered.slice(start, start + INVENTORY_MOVES_PER_PAGE);

  // UI pager
  const pageEl = document.getElementById('inv_moves_page');
  if(pageEl) pageEl.textContent = `${INVENTORY_MOVES_PAGE}/${totalPages}`;

  const countEl = document.getElementById('inv_moves_count');
  if(countEl){
    const shownFrom = total ? (start + 1) : 0;
    const shownTo = Math.min(start + INVENTORY_MOVES_PER_PAGE, total);
    countEl.textContent = total ? `${shownFrom}-${shownTo} di ${total}` : '0';
  }

  const prevBtn = document.getElementById('inv_moves_prev');
  const nextBtn = document.getElementById('inv_moves_next');
  if(prevBtn) prevBtn.disabled = INVENTORY_MOVES_PAGE <= 1;
  if(nextBtn) nextBtn.disabled = INVENTORY_MOVES_PAGE >= totalPages;

  movesTb.innerHTML = '';
  const mobileC = document.getElementById('inv_moves_mobile_cards');
  if(mobileC) mobileC.innerHTML = '';


  if(isMobile()){
    const container = document.getElementById('inv_moves_mobile_cards');
    if(container){
      renderMobileCards(container, pageRows.map(m => {
        const lot = lotById.get(Number(m.lot_id)) || null;

        const typeClass =
          m.type === 'SALE'
            ? 'sale'
            : (m.type === 'PRODUCTION' ? 'production' : (m.type === 'ADJUSTMENT' ? 'adjustment' : ''));

        const expiration = lot?.expiration_date
          ? formatDateIT(lot.expiration_date)
          : '—';

        const qty = Number(m.quantity)||0;
        const qtyDisplay =
          m.type === 'SALE'
            ? `−${Math.abs(qty)}`
            : (m.type === 'ADJUSTMENT'
                ? (qty < 0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`)
                : `+${Math.abs(qty)}`);

        const reasonTxt = (m.type === 'ADJUSTMENT' && m.reason)
          ? `Motivo: <strong>${highlightTextRaw(String(m.reason).replaceAll('_',' '), tokens)}</strong>`
          : null;

        return {
          title: `${highlightTextRaw(lot?.product_name || '—', tokens)} ${lot?.format ? '• ' + highlightTextRaw(lot.format, tokens) : ''}`,
          lines: [
            `<span class="badge-move ${typeClass}">${highlightTextRaw(typeLabel(m.type), tokens)}</span> • <strong>${highlightTextRaw(formatDateIT(m.created_at), tokens)}</strong>`,
            `Lotto: <strong>${highlightTextRaw(lot?.lot_number || '—', tokens)}</strong>`,
            `Scadenza: <strong>${highlightTextRaw(expiration, tokens)}</strong>`,
            ...(reasonTxt ? [reasonTxt] : []),
            ...(m.type === 'ADJUSTMENT' && m.note ? [`Nota: ${highlightTextRaw(String(m.note), tokens)}`] : [])
          ],
          right: highlightTextRaw(qtyDisplay, tokens)
        };
      }));
    }
    movesTb.innerHTML = '';
    return;
  }

  pageRows.forEach(m=>{
    const lot = lotById.get(Number(m.lot_id)) || null;

    const typeClass =
      m.type === 'SALE'
        ? 'sale'
        : (m.type === 'PRODUCTION' ? 'production' : (m.type === 'ADJUSTMENT' ? 'adjustment' : ''));

    const typeText = typeLabel(m.type);

    const expiration = lot?.expiration_date
      ? formatDateIT(lot.expiration_date)
      : '—';

    const qty = Number(m.quantity)||0;
    const qtyDisplay =
      m.type === 'SALE'
        ? `−${Math.abs(qty)}`
        : (m.type === 'ADJUSTMENT'
            ? (qty < 0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`)
            : `+${Math.abs(qty)}`);

    const reasonCell = (m.type === 'ADJUSTMENT')
      ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">
           ${m.reason ? `Motivo: <strong>${highlightTextRaw(String(m.reason).replaceAll('_',' '), tokens)}</strong>` : ''}
           ${m.note ? `<div>Nota: ${highlightTextRaw(String(m.note), tokens)}</div>` : ''}
         </div>`
      : '';

    const tr = document.createElement('tr');
    tr.className = `move-row ${typeClass}`;

    tr.innerHTML = `
      <td>${highlightTextRaw(formatDateIT(m.created_at), tokens)}</td>
      <td><span class="badge-move ${typeClass}">${highlightTextRaw(typeText, tokens)}</span></td>
      <td>
        <div style="font-weight:700;">${highlightTextRaw(lot?.product_name || '—', tokens)}</div>
        <div style="font-size:12px;color:#94a3b8;">${highlightTextRaw(lot?.format || '', tokens)}</div>
        ${reasonCell}
      </td>
      <td><strong>${highlightTextRaw(lot?.lot_number || '—', tokens)}</strong></td>
      <td>${highlightTextRaw(expiration, tokens)}</td>
      <td style="font-weight:900;">${highlightTextRaw(qtyDisplay, tokens)}</td>
    `;

    movesTb.appendChild(tr);
  });

  if(pageRows.length === 0){
    movesTb.innerHTML = `<tr><td colspan="6" class="muted">Nessun risultato</td></tr>`;
  }
}

function renderInventoryMoves(rows, tokens){
  const tb = document.getElementById('inv_moves_tbody');
  if(!tb) return;

  const typeLabel = (t) => t === 'SALE' ? 'Vendita' : (t === 'PRODUCTION' ? 'Produzione' : (t === 'ADJUSTMENT' ? 'Rettifica' : t));

  const filtered = (rows||[]).filter(m => {
    if(!tokens.length) return true;
    return matchesTokens(`${m.created_at} ${m.type} ${m.quantity} ${m.lot_id||''} ${m.reason||''} ${m.note||''}`, tokens);
  });

  tb.innerHTML = filtered.map(m => {
    const qty = Number(m.quantity)||0;
    const qDisp = m.type === 'SALE' ? `−${Math.abs(qty)}` : (m.type === 'ADJUSTMENT' ? (qty<0?`−${Math.abs(qty)}`:`+${Math.abs(qty)}`) : `+${Math.abs(qty)}`);
    return `
      <tr>
        <td>${highlightTextRaw(formatDateIT(m.created_at), tokens)}</td>
        <td>${highlightTextRaw(typeLabel(m.type), tokens)}</td>
        <td>${highlightTextRaw(String(m.lot_id||'—'), tokens)}</td>
        <td>${highlightTextRaw(qDisp, tokens)}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="4">Nessun risultato</td></tr>`;
}

// ==========================
// QUICK ACTIONS (Magazzino)
// ==========================
function qaEl(id){ return document.getElementById(id); }

function initQuickActionsModal(){
  // Se il modal non esiste, le quick actions useranno prompt/confirm: no crash.
  const close = qaEl('qa_close');
  const modal = qaEl('qa_modal');

  close?.addEventListener('click', qaClose);
  modal?.addEventListener('click', (e)=>{
    if(e.target && e.target.id === 'qa_modal') qaClose();
  });
}

function qaOpen(title, html){
  const modal = qaEl('qa_modal');
  const t = qaEl('qa_title');
  const body = qaEl('qa_body');
  const msg = qaEl('qa_msg');

  // fallback: se non c'è modal, non crashare
  if(!modal || !t || !body) return false;

  t.textContent = title || 'Azione rapida';
  body.innerHTML = html || '';
  if(msg) { msg.className = 'muted'; msg.textContent = ''; }
  modal.classList.remove('hidden');
  return true;
}
function qaClose(){
  const modal = qaEl('qa_modal');
  const body = qaEl('qa_body');
  const msg = qaEl('qa_msg');

  if(modal) modal.classList.add('hidden');
  if(body) body.innerHTML = '';
  if(msg) { msg.className = 'muted'; msg.textContent = ''; }
}
function qaMsg(type, txt){
  const el = qaEl('qa_msg');
  if(!el) return;
  el.className = (type || 'muted');
  el.textContent = txt || '';
}

async function refreshAllAfterAction(){
  await loadHomeDashboard();
  await loadProductsTable();

  // ricarico magazzino (reset cache per vedere subito lo stock aggiornato)
  Cache.inventoryData = null;
  Cache.inventoryInsights = null;
  INVENTORY_MOVES_PAGE = 1;
          INVENTORY_TABLE_PAGE = 1;
  if(isTabActive('tab_inventory')) await loadInventoryTab();

  // se l'utente sta su rettifiche, aggiorna anche quella tab
  if(isTabActive('tab_adjust')) await loadAdjustTab();

  applyGlobalSearch();
}

async function handleQuickAction(ds){
  const qa = ds.qa;

  // ----- Vendita rapida FEFO (da prodotto) -----
  if(qa === 'sale'){
    const productId = Number(ds.product || 0);
    if(productId <= 0) return;

    const opened = qaOpen('Vendita rapida (FEFO)', `
      <div class="qa-row">
        <div>
          <div class="muted">Quantità (barattoli)</div>
          <input id="qa_qty" class="qa-input" type="number" min="1" value="1">
        </div>
      </div>
      <div class="qa-actions">
        <button class="qa-btn" id="qa_cancel" type="button">Annulla</button>
        <button class="qa-btn primary" id="qa_go" type="button">Conferma</button>
      </div>
    `);

    if(!opened){
      // fallback minimale senza modal
      const qty = Number(prompt('Quantità (barattoli):', '1') || 0);
      if(qty<=0) return;
      if(!confirm(`Confermi vendita FEFO di ${qty}?`)) return;
      try{
        const commit = await fetchJSON('api_sale_commit_v2.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'auto',product_id:productId,quantity:qty})});
        if(commit?.success===false || commit?.error) return alert(commit.error || 'Errore vendita');
        await refreshAllAfterAction();
      }catch(e){ console.error(e); alert('Errore vendita'); }
      return;
    }

    qaEl('qa_cancel')?.addEventListener('click', qaClose);
    qaEl('qa_go')?.addEventListener('click', async ()=>{
      try{
        const qty = Number(qaEl('qa_qty')?.value || 0);
        if(qty<=0) return qaMsg('error','Quantità non valida');

        qaMsg('muted','Controllo stock...');
        const prev = await fetchJSON('api_sale_preview_v2.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'auto',product_id:productId,quantity:qty})});
        if(prev?.success===false) return qaMsg('error', prev.error || 'Errore preview');

        qaMsg('muted','Registrazione vendita...');
        const commit = await fetchJSON('api_sale_commit_v2.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'auto',product_id:productId,quantity:qty})});
        if(commit?.success===false || commit?.error) return qaMsg('error', commit.error || 'Errore commit');

        qaMsg('success', `✅ Venduti ${commit.sold} barattoli`);
        await refreshAllAfterAction();
        setTimeout(qaClose, 500);
      }catch(e){ console.error(e); qaMsg('error','Errore imprevisto'); }
    });
    return;
  }

  // ----- Vendita rapida su lotto (manual one-lot) -----
  if(qa === 'sale_lot'){
    const productId = Number(ds.product || 0);
    const lotId = Number(ds.lot || 0);
    if(productId <= 0 || lotId <= 0) return;

    const opened = qaOpen('Vendita rapida (lotto specifico)', `
      <div class="qa-row">
        <div>
          <div class="muted">Quantità (barattoli)</div>
          <input id="qa_qty" class="qa-input" type="number" min="1" value="1">
        </div>
      </div>
      <div class="qa-actions">
        <button class="qa-btn" id="qa_cancel" type="button">Annulla</button>
        <button class="qa-btn primary" id="qa_go" type="button">Conferma</button>
      </div>
    `);

    if(!opened){
      const qty = Number(prompt('Quantità (barattoli):', '1') || 0);
      if(qty<=0) return;
      if(!confirm(`Confermi vendita di ${qty} dal lotto selezionato?`)) return;
      try{
        const payload = {mode:'manual',product_id:productId,quantity:qty,lots:[{lot_id:lotId,qty}]};
        const commit = await fetchJSON('api_sale_commit_v2.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(commit?.success===false || commit?.error) return alert(commit.error || 'Errore vendita');
        await refreshAllAfterAction();
      }catch(e){ console.error(e); alert('Errore vendita'); }
      return;
    }

    qaEl('qa_cancel')?.addEventListener('click', qaClose);
    qaEl('qa_go')?.addEventListener('click', async ()=>{
      try{
        const qty = Number(qaEl('qa_qty')?.value || 0);
        if(qty<=0) return qaMsg('error','Quantità non valida');

        const payload = {mode:'manual',product_id:productId,quantity:qty,lots:[{lot_id:lotId,qty}]};

        qaMsg('muted','Controllo stock lotto...');
        const prev = await fetchJSON('api_sale_preview_v2.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(prev?.success===false) return qaMsg('error', prev.error || 'Errore preview');

        qaMsg('muted','Registrazione vendita...');
        const commit = await fetchJSON('api_sale_commit_v2.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(commit?.success===false || commit?.error) return qaMsg('error', commit.error || 'Errore commit');

        qaMsg('success', `✅ Venduti ${commit.sold} barattoli`);
        await refreshAllAfterAction();
        setTimeout(qaClose, 500);
      }catch(e){ console.error(e); qaMsg('error','Errore imprevisto'); }
    });
    return;
  }

  // ----- Rettifica rapida (lotto) -----
  if(qa === 'adj'){
    const lotId = Number(ds.lot || 0);
    if(lotId <= 0) return;

    const opened = qaOpen('Rettifica rapida', `
      <div class="qa-row">
        <div>
          <div class="muted">Direzione</div>
          <select id="qa_dir" class="qa-input">
            <option value="IN">IN (aggiungi)</option>
            <option value="OUT">OUT (togli)</option>
          </select>
        </div>
        <div>
          <div class="muted">Quantità</div>
          <input id="qa_qty" class="qa-input" type="number" min="1" value="1">
        </div>
      </div>
      <div class="qa-row">
        <div>
          <div class="muted">Motivo</div>
          <select id="qa_reason" class="qa-input">
            <option>ROTTURA</option>
            <option>RESO</option>
            <option>INVENTARIO</option>
            <option>MODIFICA_FORZATA</option>
            <option>ALTRO</option>
          </select>
        </div>
      </div>
      <div class="qa-row">
        <div>
          <div class="muted">Nota (opzionale)</div>
          <input id="qa_note" class="qa-input" maxlength="255" placeholder="es. barattolo rotto...">
        </div>
      </div>
      <div class="qa-actions">
        <button class="qa-btn" id="qa_cancel" type="button">Annulla</button>
        <button class="qa-btn primary" id="qa_go" type="button">Conferma</button>
      </div>
    `);

    if(!opened){
      const direction = (prompt('Direzione (IN/OUT):', 'OUT') || 'OUT').toUpperCase();
      const qty = Number(prompt('Quantità:', '1') || 0);
      const reason = (prompt('Motivo (ROTTURA/RESO/INVENTARIO/MODIFICA_FORZATA/ALTRO):', 'ROTTURA') || 'ROTTURA').toUpperCase();
      if(qty<=0) return;
      if(!confirm(`Confermi rettifica ${direction} di ${qty}?`)) return;
      try{
        const res = await fetchJSON('api_adjust_stock.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_id:lotId,direction,quantity:qty,reason,note:null})});
        if(res?.success===false || res?.error) return alert(res.error || 'Errore rettifica');
        await refreshAllAfterAction();
      }catch(e){ console.error(e); alert('Errore rettifica'); }
      return;
    }

    qaEl('qa_cancel')?.addEventListener('click', qaClose);
    qaEl('qa_go')?.addEventListener('click', async ()=>{
      try{
        const direction = qaEl('qa_dir')?.value || 'IN';
        const qty = Number(qaEl('qa_qty')?.value || 0);
        const reason = qaEl('qa_reason')?.value || 'ALTRO';
        const note = (qaEl('qa_note')?.value || '').trim() || null;

        if(qty<=0) return qaMsg('error','Quantità non valida');

        qaMsg('muted','Registrazione rettifica...');
        const res = await fetchJSON('api_adjust_stock.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_id:lotId,direction,quantity:qty,reason,note})});
        if(res?.success===false || res?.error) return qaMsg('error', res.error || 'Errore rettifica');

        qaMsg('success','✅ Rettifica registrata');
        await refreshAllAfterAction();
        setTimeout(qaClose, 500);
      }catch(e){ console.error(e); qaMsg('error','Errore imprevisto'); }
    });
    return;
  }

  // ----- Produzione rapida (da prodotto) -----
  if(qa === 'prod'){
    const productId = Number(ds.product || 0);
    if(productId <= 0) return;

    const opened = qaOpen('Produzione rapida', `
      <div class="qa-row">
        <div>
          <div class="muted">Quantità</div>
          <input id="qa_qty" class="qa-input" type="number" min="1" value="1">
        </div>
        <div>
          <div class="muted">Tipo quantità</div>
          <select id="qa_qtype" class="qa-input">
            <option value="units">Barattoli</option>
            <option value="trays">Vassoi</option>
          </select>
        </div>
      </div>
      <div class="qa-row">
        <div>
          <div class="muted">Lotto</div>
          <input id="qa_lot" class="qa-input" placeholder="es. L2402A">
        </div>
        <div>
          <div class="muted">Scadenza</div>
          <input id="qa_exp" class="qa-input" type="date">
        </div>
      </div>
      <div class="qa-actions">
        <button class="qa-btn" id="qa_cancel" type="button">Annulla</button>
        <button class="qa-btn primary" id="qa_go" type="button">Conferma</button>
      </div>
    `);

    if(!opened){
      const lot_number = (prompt('Lotto:', '') || '').trim();
      const qty = Number(prompt('Quantità:', '1') || 0);
      if(!lot_number || qty<=0) return;
      if(!confirm(`Confermi produzione lotto ${lot_number} (+${qty})?`)) return;
      try{
        const res = await fetchJSON('api_production.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:productId,lot_number,expiration_date:'',quantity_input:qty,quantity_type:'units'})});
        if(res?.success===false || res?.error) return alert(res.error || 'Errore produzione');
        await refreshAllAfterAction();
      }catch(e){ console.error(e); alert('Errore produzione'); }
      return;
    }

    qaEl('qa_cancel')?.addEventListener('click', qaClose);
    qaEl('qa_go')?.addEventListener('click', async ()=>{
      try{
        const quantity_input = Number(qaEl('qa_qty')?.value || 0);
        const quantity_type = qaEl('qa_qtype')?.value || 'units';
        const lot_number = (qaEl('qa_lot')?.value || '').trim();
        const expiration_date = (qaEl('qa_exp')?.value || '').trim();

        if(quantity_input<=0 || !lot_number) return qaMsg('error','Dati mancanti (quantità/lotto)');

        qaMsg('muted','Registrazione produzione...');
        const res = await fetchJSON('api_production.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:productId,lot_number,expiration_date,quantity_input,quantity_type})});
        if(res?.success===false || res?.error) return qaMsg('error', res.error || 'Errore produzione');

        qaMsg('success','✅ Produzione registrata');
        await refreshAllAfterAction();
        setTimeout(qaClose, 500);
      }catch(e){ console.error(e); qaMsg('error','Errore imprevisto'); }
    });
    return;
  }
}
