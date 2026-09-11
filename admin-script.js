// ─── CONFIG ───────────────────────────────────────────────────
const ADMIN_PASSWORD = (typeof CONFIG !== 'undefined') ? CONFIG.ADMIN_PASSWORD : 'IRON&EDGE';
const PER_PAGE = 15;

// ─── STATE ────────────────────────────────────────────────────
let allBookings = [];
let filtered    = [];
let sortCol     = 'Booked At';
let sortDir     = -1; // -1 = desc, 1 = asc
let currentPage = 1;
let scriptUrl = (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL && CONFIG.APPS_SCRIPT_URL !== 'PASTE_YOUR_APPS_SCRIPT_URL_HERE')
  ? CONFIG.APPS_SCRIPT_URL
  : (localStorage.getItem('appsScriptUrl') || 'https://script.google.com/macros/s/AKfycbz2U5e6QdoVi80QGdIJMtLaucYnkwd5N7lFL35JQLaqtxBy9gdbix1n1dWkZCKYZJr4Eg/exec');

// ─── AUTH ─────────────────────────────────────────────────────
function doLogin() {
  const pw = document.getElementById('adminPass').value;
  if (pw === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminAuth', '1');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    init();
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
}

function doLogout() {
  sessionStorage.removeItem('adminAuth');
  location.reload();
}

// ─── INIT ─────────────────────────────────────────────────────
function init() {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
  document.getElementById('statTodayDate').textContent = today;

  if (scriptUrl) {
    document.getElementById('scriptUrlInput').value = scriptUrl;
    document.getElementById('setupBanner').style.display = localStorage.getItem('bannerDismissed') ? 'none' : '';
    loadBookings();
  } else {
    setStatus('Paste your Apps Script URL above to load bookings.', false);
    document.getElementById('tableBody').innerHTML = `
      <tr><td colspan="9" style="text-align:center;padding:3rem;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:0.5rem">📋</div>
        No Script URL set. Follow the setup guide above.
      </td></tr>`;
  }
}

// ─── LOAD BOOKINGS ────────────────────────────────────────────
async function loadBookings() {
  if (!scriptUrl) return;
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true; btn.textContent = '⟳ Loading…';
  setStatus('Fetching from Google Sheets…', true);

  try {
    const res  = await fetch(scriptUrl + '?action=getBookings');
    const data = await res.json();
    if (data.status === 'ok') {
      allBookings = data.bookings.reverse(); // newest first
      computeStats();
      renderTable();
      setStatus('Live — ' + allBookings.length + ' bookings loaded · ' + new Date().toLocaleTimeString(), true);
    } else {
      throw new Error(data.message);
    }
  } catch(e) {
    setStatus('Error loading data. Check your Apps Script URL.', false);
    document.getElementById('tableBody').innerHTML =
      `<tr class="loading-row"><td colspan="9">Could not connect to Google Sheets. Verify the URL is correct and the deployment is set to "Anyone can access".</td></tr>`;
  }
  btn.disabled = false; btn.textContent = '⟳ Refresh';
}

// ─── STATS ────────────────────────────────────────────────────
function computeStats() {
  const todayStr = new Date().toISOString().split('T')[0];
  const weekAgo  = new Date(Date.now() - 7*24*60*60*1000);

  let todayCount = 0, weekCount = 0;
  const serviceCounts = {};

  allBookings.forEach(b => {
    const bookedAt = new Date(b['Booked At']);
    if (b['Date'] === todayStr) todayCount++;
    if (bookedAt >= weekAgo) weekCount++;
    const svc = (b['Service'] || '').split('—')[0].trim();
    serviceCounts[svc] = (serviceCounts[svc] || 0) + 1;
  });

  const topService = Object.entries(serviceCounts).sort((a,b) => b[1]-a[1])[0];

  document.getElementById('statTotal').textContent  = allBookings.length;
  document.getElementById('statToday').textContent  = todayCount;
  document.getElementById('statWeek').textContent   = weekCount;
  document.getElementById('statTopService').textContent = topService ? topService[0] : '—';
}

// ─── RENDER TABLE ─────────────────────────────────────────────
function renderTable() {
  const q      = document.getElementById('searchBox').value.toLowerCase();
  const barber = document.getElementById('filterBarber').value;
  const dRange = document.getElementById('filterDate').value;
  const todayStr = new Date().toISOString().split('T')[0];
  const weekAgo  = new Date(Date.now() - 7*24*60*60*1000);
  const monthAgo = new Date(Date.now() - 30*24*60*60*1000);

  filtered = allBookings.filter(b => {
    const search = (b['Name']||'') + (b['Email']||'') + (b['Service']||'');
    if (q && !search.toLowerCase().includes(q)) return false;
    if (barber && b['Barber'] !== barber) return false;
    if (dRange === 'today' && b['Date'] !== todayStr) return false;
    if (dRange === 'week' && new Date(b['Date']) < weekAgo) return false;
    if (dRange === 'month' && new Date(b['Date']) < monthAgo) return false;
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let va = a[sortCol] || '', vb = b[sortCol] || '';
    return va < vb ? sortDir : va > vb ? -sortDir : 0;
  });

  currentPage = 1;
  renderPage();
  renderPagination();
}

function renderPage() {
  const tbody = document.getElementById('tableBody');
  const start = (currentPage - 1) * PER_PAGE;
  const rows  = filtered.slice(start, start + PER_PAGE);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:3rem;color:var(--muted)">
      <div class="empty-icon">📭</div>No bookings match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(b => {
    const bookedAt = b['Booked At'] ? new Date(b['Booked At']).toLocaleString() : '—';
    const service  = (b['Service']||'—').split('—')[0].trim();
    return `<tr>
      <td class="td-id">${b['ID']||'—'}</td>
      <td style="color:var(--muted);font-size:0.78rem">${bookedAt}</td>
      <td class="td-name">${esc(b['Name']||'—')}</td>
      <td class="td-email">${esc(b['Email']||'—')}</td>
      <td class="td-service">${esc(service)}</td>
      <td>${esc(b['Barber']||'—')}</td>
      <td>${esc(b['Date']||'—')}</td>
      <td>${esc(b['Time']||'—')}</td>
      <td><span class="badge-status">Confirmed</span></td>
    </tr>`;
  }).join('');
}

// ─── PAGINATION ───────────────────────────────────────────────
function renderPagination() {
  const total = Math.ceil(filtered.length / PER_PAGE);
  const pag   = document.getElementById('pagination');
  if (total <= 1) { pag.innerHTML = ''; return; }

  let html = `<span class="page-info">${filtered.length} results</span>`;
  html += `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹ Prev</button>`;
  for (let i = 1; i <= total; i++) {
    if (total > 7 && i > 2 && i < total - 1 && Math.abs(i - currentPage) > 1) {
      if (i === 3 || i === total - 2) html += '<span style="color:var(--muted);padding:0 4px">…</span>';
      continue;
    }
    html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===total?'disabled':''}>Next ›</button>`;
  pag.innerHTML = html;
}

function goPage(n) {
  const total = Math.ceil(filtered.length / PER_PAGE);
  if (n < 1 || n > total) return;
  currentPage = n;
  renderPage();
  renderPagination();
}

// ─── SORT ─────────────────────────────────────────────────────
function sortBy(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  document.querySelectorAll('th').forEach(th => th.classList.remove('sorted'));
  const th = document.querySelector(`th[data-col="${col}"]`);
  if (th) {
    th.classList.add('sorted');
    th.querySelector('.sort-arrow').textContent = sortDir === 1 ? '↑' : '↓';
  }
  renderTable();
}

// ─── HELPERS ──────────────────────────────────────────────────
function setStatus(msg, ok) {
  document.getElementById('statusText').textContent = msg;
  document.getElementById('statusDot').style.background = ok ? 'var(--gold)' : 'var(--danger)';
}

function saveScriptUrl() {
  const val = document.getElementById('scriptUrlInput').value.trim();
  if (!val.startsWith('https://')) { alert('Please enter a valid URL.'); return; }
  scriptUrl = val;
  localStorage.setItem('appsScriptUrl', scriptUrl);
  loadBookings();
}

function dismissBanner() {
  localStorage.setItem('bannerDismissed', '1');
  document.getElementById('setupBanner').style.display = 'none';
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── AUTO REFRESH every 60 seconds ───────────────────────────
setInterval(() => { if (scriptUrl) loadBookings(); }, 60000);

// ─── RESTORE SESSION ──────────────────────────────────────────
if (sessionStorage.getItem('adminAuth') === '1') {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  init();
}
