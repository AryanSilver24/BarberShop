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

// ─── COMPLETED BOOKINGS MANAGEMENT (GLOBAL & LOCAL SYNC) ──────
function getCompletedKeys() {
  const keys = new Set();
  try {
    const saved = localStorage.getItem('completedBookings');
    if (saved) JSON.parse(saved).forEach(k => keys.add(k));
  } catch (e) {}

  if (Array.isArray(allBookings)) {
    allBookings.forEach(b => {
      const key = b['ID'] || ((b['Name'] || '') + '_' + (b['Booked At'] || ''));
      if (b['Status'] === 'Completed' || b['status'] === 'Completed') {
        keys.add(key);
      }
    });
  }

  return Array.from(keys);
}

async function markCompleted(id, name, bookedAt) {
  const key = id || (name + '_' + bookedAt);
  const completed = getCompletedKeys();
  if (!completed.includes(key)) {
    completed.push(key);
    localStorage.setItem('completedBookings', JSON.stringify(completed));
  }

  const found = allBookings.find(b => (b['ID'] && b['ID'] === id) || ((b['Name'] || '') + '_' + (b['Booked At'] || '')) === key);
  if (found) found['Status'] = 'Completed';

  computeStats();
  renderTable();

  if (scriptUrl) {
    try {
      fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markCompleted', id: id || '', name: name || '', bookedAt: bookedAt || '' })
      });
    } catch (e) {
      console.error("Could not sync completion to Google Sheets", e);
    }
  }
}

async function restoreSingleCompleted(id, name, bookedAt) {
  const key = id || (name + '_' + bookedAt);
  let completed = getCompletedKeys();
  completed = completed.filter(k => k !== key);
  localStorage.setItem('completedBookings', JSON.stringify(completed));

  const found = allBookings.find(b => (b['ID'] && b['ID'] === id) || ((b['Name'] || '') + '_' + (b['Booked At'] || '')) === key);
  if (found) found['Status'] = 'Active';

  computeStats();
  renderTable();

  if (scriptUrl) {
    try {
      fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restoreBooking', id: id || '', name: name || '', bookedAt: bookedAt || '' })
      });
    } catch (e) {
      console.error("Could not sync restore to Google Sheets", e);
    }
  }
}


function updateRestoreButton() {
  const count = getCompletedKeys().length;
  const optCompleted = document.getElementById('optCompleted');
  if (optCompleted) {
    optCompleted.textContent = `Completed Bookings (${count})`;
  }
}

const SERVICE_PRICES = {
  'Classic Haircut': 35,
  'Hot Towel Shave': 45,
  'Skin Fade': 40,
  'Beard Shape & Trim': 25,
  'Cut & Shave Combo': 70,
  'Kids\' Cut': 22
};

function getBookingPrice(b) {
  if (b['finalPrice'] !== undefined && !isNaN(b['finalPrice'])) return Number(b['finalPrice']);
  if (b['Price'] !== undefined && !isNaN(b['Price'])) return Number(b['Price']);
  
  const rawService = b['Service'] || '';
  const match = rawService.match(/\$(\d+)/);
  if (match) return parseInt(match[1]);

  const cleanService = rawService.split('—')[0].trim();
  return SERVICE_PRICES[cleanService] || 35;
}

// ─── STATS & REVENUE ANALYTICS ──────────────────────────────────
function computeStats() {
  const completedKeys = getCompletedKeys();

  const activeBookings = [];
  const completedBookings = [];

  allBookings.forEach(b => {
    const key = b['ID'] || ((b['Name']||'') + '_' + (b['Booked At']||''));
    if (completedKeys.includes(key)) {
      completedBookings.push(b);
    } else {
      activeBookings.push(b);
    }
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const weekAgo  = new Date(Date.now() - 7*24*60*60*1000);

  let todayCount = 0, weekCount = 0;
  const serviceCounts = {};

  activeBookings.forEach(b => {
    const bookedAt = new Date(b['Booked At']);
    if (b['Date'] === todayStr) todayCount++;
    if (bookedAt >= weekAgo) weekCount++;

    const svcName = (b['Service'] || '').split('—')[0].trim();
    serviceCounts[svcName] = (serviceCounts[svcName] || 0) + 1;
  });

  let earnedRevenue = 0;
  let pendingRevenue = 0;
  const barberRev = {
    'Marcus Reeves': { rev: 0, count: 0 },
    'Danny Kowalski': { rev: 0, count: 0 },
    'Yusuf Ali': { rev: 0, count: 0 }
  };

  allBookings.forEach(b => {
    const price = getBookingPrice(b);
    const key = b['ID'] || ((b['Name']||'') + '_' + (b['Booked At']||''));
    const isCompleted = completedKeys.includes(key);

    if (isCompleted) {
      earnedRevenue += price;
    } else {
      pendingRevenue += price;
    }

    const barberName = b['Barber'] || 'Any';
    if (barberRev[barberName]) {
      if (completedBookings.length > 0) {
        if (isCompleted) {
          barberRev[barberName].rev += price;
          barberRev[barberName].count += 1;
        }
      } else {
        barberRev[barberName].rev += price;
        barberRev[barberName].count += 1;
      }
    }
  });

  const hasCompleted = completedBookings.length > 0;
  const displayRevenue = hasCompleted ? earnedRevenue : (earnedRevenue + pendingRevenue);
  const revenueSub = hasCompleted 
    ? `${completedBookings.length} Completed ($${pendingRevenue} pending)` 
    : `Total Potential Pipeline`;

  const topService = Object.entries(serviceCounts).sort((a,b) => b[1]-a[1])[0];

  document.getElementById('statRevenue').textContent = `$${displayRevenue.toLocaleString()}`;
  document.getElementById('statRevenueSub').textContent = revenueSub;
  document.getElementById('statTotal').textContent  = activeBookings.length;
  document.getElementById('statToday').textContent  = todayCount;
  document.getElementById('statWeek').textContent   = weekCount;
  document.getElementById('statTopService').textContent = topService ? topService[0] : '—';

  // Update Barber Revenue Analytics Cards
  if (document.getElementById('revMarcus')) {
    const subLabel = hasCompleted ? 'Completed Cuts' : 'Active Bookings';
    document.getElementById('revMarcus').textContent = `$${barberRev['Marcus Reeves'].rev}`;
    document.getElementById('countMarcus').textContent = `${barberRev['Marcus Reeves'].count} ${subLabel}`;
    document.getElementById('revDanny').textContent = `$${barberRev['Danny Kowalski'].rev}`;
    document.getElementById('countDanny').textContent = `${barberRev['Danny Kowalski'].count} ${subLabel}`;
    document.getElementById('revYusuf').textContent = `$${barberRev['Yusuf Ali'].rev}`;
    document.getElementById('countYusuf').textContent = `${barberRev['Yusuf Ali'].count} ${subLabel}`;
  }
}

// ─── RENDER TABLE ─────────────────────────────────────────────
function renderTable() {
  const q      = document.getElementById('searchBox').value.toLowerCase();
  const barber = document.getElementById('filterBarber').value;
  const dRange = document.getElementById('filterDate').value;
  const statusFilter = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'active';
  const todayStr = new Date().toISOString().split('T')[0];
  const weekAgo  = new Date(Date.now() - 7*24*60*60*1000);
  const monthAgo = new Date(Date.now() - 30*24*60*60*1000);
  const completedKeys = getCompletedKeys();

  filtered = allBookings.filter(b => {
    const key = b['ID'] || ((b['Name']||'') + '_' + (b['Booked At']||''));
    const isCompleted = completedKeys.includes(key);

    if (statusFilter === 'active' && isCompleted) return false;
    if (statusFilter === 'completed' && !isCompleted) return false;

    const search = (b['Name']||'') + (b['Email']||'') + (b['Service']||'');
    if (q && !search.toLowerCase().includes(q)) return false;
    if (barber && b['Barber'] !== barber) return false;
    if (dRange === 'today' && b['Date'] !== todayStr) return false;
    if (dRange === 'week' && new Date(b['Date']) < weekAgo) return false;
    if (dRange === 'month' && new Date(b['Date']) < monthAgo) return false;
    return true;
  });

  // Sort (Default: Latest booking on top)
  filtered.sort((a, b) => {
    let va = a[sortCol] || '', vb = b[sortCol] || '';
    if (sortCol === 'Booked At') {
      const ta = Date.parse(va) || 0;
      const tb = Date.parse(vb) || 0;
      if (ta !== tb) return (tb - ta) * (-sortDir);
    }
    return va < vb ? sortDir : va > vb ? -sortDir : 0;
  });

  currentPage = 1;
  renderPage();
  renderPagination();
  updateRestoreButton();
}

function renderPage() {
  const tbody = document.getElementById('tableBody');
  const start = (currentPage - 1) * PER_PAGE;
  const rows  = filtered.slice(start, start + PER_PAGE);
  const completedKeys = getCompletedKeys();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--muted)">
      <div class="empty-icon">📭</div>No bookings match your selected view/filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(b => {
    const bookedAt = b['Booked At'] ? new Date(b['Booked At']).toLocaleString() : '—';
    const service  = (b['Service']||'—').split('—')[0].trim();
    const idVal    = esc(b['ID']||'');
    const nameVal  = esc(b['Name']||'');
    const bookedVal= esc(b['Booked At']||'');
    const key      = b['ID'] || ((b['Name']||'') + '_' + (b['Booked At']||''));
    const isCompleted = completedKeys.includes(key);

    const actionCell = isCompleted 
      ? `<span class="completed-badge">✓ Completed</span>
         <button class="restore-row-btn" onclick="restoreSingleCompleted('${idVal}', '${nameVal}', '${bookedVal}')">
           ↺ Restore
         </button>`
      : `<button class="complete-btn" onclick="markCompleted('${idVal}', '${nameVal}', '${bookedVal}')">
           ✓ Mark Completed
         </button>`;

    return `<tr>
      <td class="td-id">${idVal || '—'}</td>
      <td style="color:var(--muted);font-size:0.78rem">${bookedAt}</td>
      <td class="td-name">${nameVal || '—'}</td>
      <td class="td-email">${esc(b['Email']||'—')}</td>
      <td class="td-service">${esc(service)}</td>
      <td>${esc(b['Barber']||'—')}</td>
      <td>${actionCell}</td>
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
