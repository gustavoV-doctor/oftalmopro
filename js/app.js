// ===== CONFIGURAÇÃO DE PROCEDIMENTOS =====
const PROCEDURES = [
  { id: 'consulta', name: 'Consulta', price: 30 },
  { id: 'retinografia', name: 'Retinografia', price: 80 },
  { id: 'mapeamento', name: 'Mapeamento de Retina', price: 100 },
  { id: 'schirmer', name: 'Teste de Schirmer', price: 50 },
  { id: 'tonometria', name: 'Tonometria', price: 30 },
  { id: 'oct', name: 'OCT', price: 120 },
  { id: 'campimetria', name: 'Campimetria', price: 80 },
  { id: 'paquimetria', name: 'Paquimetria', price: 50 },
];

// ===== UTILIDADES =====
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function storageKey(dateStr) {
  return `oftalmopro_${dateStr}`;
}

function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getDayName(dateStr) {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const date = new Date(dateStr + 'T12:00:00');
  return days[date.getDay()];
}

function getMonthName(monthNum) {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return months[monthNum];
}

function getFullDateHeader() {
  const now = new Date();
  const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ===== DADOS =====
function loadDay(dateStr) {
  const raw = localStorage.getItem(storageKey(dateStr));
  if (!raw) return { date: dateStr, patients: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { date: dateStr, patients: [] };
  }
}

function saveDay(data) {
  localStorage.setItem(storageKey(data.date), JSON.stringify(data));
  // Registrar este dia no índice de dias trabalhados
  saveDayToIndex(data.date);
  // Sync com Firebase
  if (typeof saveAndSync === 'function') {
    saveAndSync(data.date);
  }
}

function saveDayToIndex(dateStr) {
  const index = getDayIndex();
  if (!index.includes(dateStr)) {
    index.push(dateStr);
    index.sort();
    localStorage.setItem('oftalmopro_index', JSON.stringify(index));
  }
}

function removeDayFromIndex(dateStr) {
  let index = getDayIndex();
  index = index.filter(d => d !== dateStr);
  localStorage.setItem('oftalmopro_index', JSON.stringify(index));
}

function getDayIndex() {
  const raw = localStorage.getItem('oftalmopro_index');
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function calculatePatientTotal(patient) {
  return (patient.procedures || []).reduce((sum, procId) => {
    const proc = PROCEDURES.find(p => p.id === procId);
    return sum + (proc ? proc.price : 0);
  }, 0);
}

function calculateDayTotal(dateStr) {
  const data = loadDay(dateStr);
  return data.patients.reduce((sum, p) => sum + calculatePatientTotal(p), 0);
}

// ===== NAVEGAÇÃO =====
let currentTab = 'hoje';

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tab}`);
  });

  if (tab === 'hoje') renderToday();
  if (tab === 'historico') renderHistory();
  if (tab === 'relatorios') renderReports();

  lucide.createIcons();
}

// ===== MODAL =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function openAddPatientModal() {
  document.getElementById('input-patient-name').value = '';
  document.getElementById('input-patient-time').value = '';
  openModal('modal-add-patient');
  setTimeout(() => document.getElementById('input-patient-name').focus(), 100);
}

// ===== PACIENTES =====
function addPatient() {
  const name = document.getElementById('input-patient-name').value.trim();
  const time = document.getElementById('input-patient-time').value;

  if (!name) {
    alert('Digite o nome do paciente.');
    return;
  }

  const today = getTodayStr();
  const data = loadDay(today);

  data.patients.push({
    id: generateId(),
    name,
    time: time || '--:--',
    procedures: []
  });

  // Ordenar por horário
  data.patients.sort((a, b) => {
    if (a.time === '--:--') return 1;
    if (b.time === '--:--') return -1;
    return a.time.localeCompare(b.time);
  });

  saveDay(data);
  closeModal('modal-add-patient');
  renderToday();
}

function deletePatient(patientId) {
  if (!confirm('Remover este paciente?')) return;

  const today = getTodayStr();
  const data = loadDay(today);
  data.patients = data.patients.filter(p => p.id !== patientId);
  saveDay(data);
  renderToday();
}

function toggleProcedure(patientId, procedureId) {
  const today = getTodayStr();
  const data = loadDay(today);
  const patient = data.patients.find(p => p.id === patientId);
  if (!patient) return;

  if (!patient.procedures) patient.procedures = [];

  const idx = patient.procedures.indexOf(procedureId);
  if (idx >= 0) {
    patient.procedures.splice(idx, 1);
  } else {
    patient.procedures.push(procedureId);
  }

  saveDay(data);
  renderToday();
}

// ===== RENDER: HOJE =====
function renderStatsBar() {
  const today = getTodayStr();
  const data = loadDay(today);
  const bar = document.getElementById('stats-bar');
  if (!bar) return;

  const totalPatients = data.patients.length;

  // Contar procedimentos
  const counts = {};
  PROCEDURES.forEach(p => counts[p.id] = 0);
  data.patients.forEach(p => {
    (p.procedures || []).forEach(procId => {
      if (counts[procId] !== undefined) counts[procId]++;
    });
  });

  let html = `<div class="stat-badge patients ${totalPatients > 0 ? 'has-value' : ''}">
    <span class="badge-count">${totalPatients}</span>
    <span class="badge-label">Pacientes</span>
  </div>`;

  PROCEDURES.forEach(proc => {
    const count = counts[proc.id];
    html += `<div class="stat-badge procedure ${count > 0 ? 'has-value' : ''}">
      <span class="badge-count">${count}</span>
      <span class="badge-label">${proc.name}</span>
    </div>`;
  });

  bar.innerHTML = html;
}

function renderToday() {
  const today = getTodayStr();
  const data = loadDay(today);

  // Header
  document.getElementById('header-date').textContent = getFullDateHeader();

  // Stats bar
  renderStatsBar();

  // Total do dia
  const dayTotal = data.patients.reduce((sum, p) => sum + calculatePatientTotal(p), 0);
  document.getElementById('daily-total').textContent = formatCurrency(dayTotal);

  const listEl = document.getElementById('patient-list');

  if (data.patients.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <i data-lucide="users" class="empty-icon"></i>
        <p><strong>Nenhum paciente registrado hoje.</strong></p>
        <p class="text-muted">Clique em "Novo Paciente" para começar.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  listEl.innerHTML = data.patients.map(patient => {
    const total = calculatePatientTotal(patient);
    const initials = patient.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    const chips = PROCEDURES.map(proc => {
      const isActive = (patient.procedures || []).includes(proc.id);
      return `<button class="procedure-chip ${isActive ? 'active' : ''}"
                onclick="toggleProcedure('${patient.id}', '${proc.id}')">
                ${proc.name} <span class="price">${formatCurrency(proc.price)}</span>
              </button>`;
    }).join('');

    return `
      <div class="patient-card">
        <div class="patient-header">
          <div class="patient-info">
            <div class="patient-avatar">${initials}</div>
            <div>
              <div class="patient-name">${patient.name}</div>
              <div class="patient-time">${patient.time}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="patient-total">${formatCurrency(total)}</span>
            <button class="btn-danger" onclick="deletePatient('${patient.id}')">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
        </div>
        <div class="procedures-grid">${chips}</div>
      </div>`;
  }).join('');

  lucide.createIcons();
}

// ===== RENDER: HISTÓRICO =====
function populateMonthFilters() {
  const index = getDayIndex();
  const months = new Set();

  index.forEach(dateStr => {
    const [y, m] = dateStr.split('-');
    months.add(`${y}-${m}`);
  });

  const sorted = Array.from(months).sort().reverse();

  ['filter-month', 'report-month'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Todos os meses</option>';
    sorted.forEach(ym => {
      const [y, m] = ym.split('-');
      const label = `${getMonthName(parseInt(m) - 1)} ${y}`;
      sel.innerHTML += `<option value="${ym}" ${ym === current ? 'selected' : ''}>${label}</option>`;
    });
  });
}

function renderHistory() {
  populateMonthFilters();
  const filterMonth = document.getElementById('filter-month').value;
  let index = getDayIndex();

  // Filtrar por mês
  if (filterMonth) {
    index = index.filter(d => d.startsWith(filterMonth));
  }

  // Ordenar do mais recente pro mais antigo
  index = index.slice().sort().reverse();

  // Calcular resumo
  let totalDays = 0;
  let totalPatients = 0;
  let totalRevenue = 0;

  const rows = index.map(dateStr => {
    const data = loadDay(dateStr);
    const patientCount = data.patients.length;
    const dayTotal = data.patients.reduce((s, p) => s + calculatePatientTotal(p), 0);

    if (patientCount > 0 || dayTotal > 0) {
      totalDays++;
      totalPatients += patientCount;
      totalRevenue += dayTotal;
    }

    return { dateStr, patientCount, dayTotal };
  }).filter(r => r.patientCount > 0 || r.dayTotal > 0);

  // Resumo
  const avgPerDay = totalDays > 0 ? totalRevenue / totalDays : 0;

  document.getElementById('history-summary').innerHTML = `
    <div class="summary-card">
      <div class="label">Dias Trabalhados</div>
      <div class="value blue">${totalDays}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Pacientes</div>
      <div class="value purple">${totalPatients}</div>
    </div>
    <div class="summary-card">
      <div class="label">Faturamento Total</div>
      <div class="value green">${formatCurrency(totalRevenue)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Média por Dia</div>
      <div class="value yellow">${formatCurrency(avgPerDay)}</div>
    </div>`;

  // Tabela
  const tbody = document.getElementById('history-body');
  const emptyEl = document.getElementById('history-empty');
  const tableWrapper = document.querySelector('.history-table-wrapper');

  if (rows.length === 0) {
    tableWrapper.style.display = 'none';
    emptyEl.style.display = 'block';
    lucide.createIcons();
    return;
  }

  tableWrapper.style.display = 'block';
  emptyEl.style.display = 'none';

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${formatDateBR(r.dateStr)}</td>
      <td>${getDayName(r.dateStr)}</td>
      <td>${r.patientCount}</td>
      <td class="amount">${formatCurrency(r.dayTotal)}</td>
      <td>
        <button class="btn-sm" onclick="showDayDetail('${r.dateStr}')">Ver detalhes</button>
      </td>
    </tr>`).join('');

  lucide.createIcons();
}

function showDayDetail(dateStr) {
  const data = loadDay(dateStr);
  const dayTotal = data.patients.reduce((s, p) => s + calculatePatientTotal(p), 0);

  document.getElementById('detail-day-title').textContent =
    `${getDayName(dateStr)}, ${formatDateBR(dateStr)} — ${formatCurrency(dayTotal)}`;

  const body = document.getElementById('detail-day-body');

  if (data.patients.length === 0) {
    body.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">Nenhum paciente neste dia.</p>';
  } else {
    body.innerHTML = data.patients.map(p => {
      const total = calculatePatientTotal(p);
      const procs = (p.procedures || []).map(procId => {
        const proc = PROCEDURES.find(pr => pr.id === procId);
        return proc ? `<span class="detail-proc-tag">${proc.name} (${formatCurrency(proc.price)})</span>` : '';
      }).join('');

      return `
        <div class="detail-patient">
          <div class="detail-patient-header">
            <div>
              <span class="detail-patient-name">${p.name}</span>
              <span class="detail-patient-time"> — ${p.time}</span>
            </div>
            <span class="detail-patient-total">${formatCurrency(total)}</span>
          </div>
          <div class="detail-procedures">${procs || '<span class="text-muted" style="font-size:0.8rem;">Sem procedimentos</span>'}</div>
        </div>`;
    }).join('');
  }

  openModal('modal-day-detail');
}

// ===== RENDER: RELATÓRIOS =====
function renderReports() {
  populateMonthFilters();
  const filterMonth = document.getElementById('report-month').value;
  let index = getDayIndex();

  if (filterMonth) {
    index = index.filter(d => d.startsWith(filterMonth));
  }

  // Coletar estatísticas
  let totalDays = 0;
  let totalPatients = 0;
  let totalRevenue = 0;
  const procedureCounts = {};
  const procedureRevenue = {};

  PROCEDURES.forEach(p => {
    procedureCounts[p.id] = 0;
    procedureRevenue[p.id] = 0;
  });

  index.forEach(dateStr => {
    const data = loadDay(dateStr);
    if (data.patients.length === 0) return;
    totalDays++;
    totalPatients += data.patients.length;

    data.patients.forEach(patient => {
      const patientTotal = calculatePatientTotal(patient);
      totalRevenue += patientTotal;

      (patient.procedures || []).forEach(procId => {
        if (procedureCounts[procId] !== undefined) {
          procedureCounts[procId]++;
          const proc = PROCEDURES.find(p => p.id === procId);
          if (proc) procedureRevenue[procId] += proc.price;
        }
      });
    });
  });

  const avgPerDay = totalDays > 0 ? totalRevenue / totalDays : 0;
  const avgPatientsPerDay = totalDays > 0 ? (totalPatients / totalDays).toFixed(1) : 0;
  const totalProcedures = Object.values(procedureCounts).reduce((s, c) => s + c, 0);

  // Cards de resumo
  const periodLabel = filterMonth
    ? (() => { const [y, m] = filterMonth.split('-'); return `em ${getMonthName(parseInt(m) - 1)} ${y}`; })()
    : 'total';

  document.getElementById('report-cards').innerHTML = `
    <div class="report-card">
      <div class="label">Faturamento ${periodLabel}</div>
      <div class="value green">${formatCurrency(totalRevenue)}</div>
      <div class="sub">${totalDays} dias trabalhados</div>
    </div>
    <div class="report-card">
      <div class="label">Média por Dia</div>
      <div class="value yellow">${formatCurrency(avgPerDay)}</div>
      <div class="sub">${avgPatientsPerDay} pacientes/dia</div>
    </div>
    <div class="report-card">
      <div class="label">Total de Pacientes</div>
      <div class="value blue">${totalPatients}</div>
      <div class="sub">${totalProcedures} procedimentos realizados</div>
    </div>
    <div class="report-card">
      <div class="label">Procedimento Mais Feito</div>
      <div class="value purple">${getMostCommonProcedure(procedureCounts)}</div>
      <div class="sub">${procedureCounts[getMostCommonProcedureId(procedureCounts)] || 0} vezes</div>
    </div>`;

  // Detalhamento por procedimento
  const maxRevenue = Math.max(...Object.values(procedureRevenue), 1);

  const procRows = PROCEDURES
    .map(proc => ({
      ...proc,
      count: procedureCounts[proc.id],
      revenue: procedureRevenue[proc.id]
    }))
    .filter(p => p.count > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (procRows.length > 0) {
    document.getElementById('report-detail').innerHTML = `
      <h3>Detalhamento por Procedimento</h3>
      ${procRows.map(p => `
        <div class="procedure-row">
          <span class="name" style="min-width:180px;">${p.name}</span>
          <span class="count">${p.count}x</span>
          <div class="procedure-bar">
            <div class="procedure-bar-fill" style="width:${(p.revenue / maxRevenue * 100).toFixed(0)}%"></div>
          </div>
          <span class="total">${formatCurrency(p.revenue)}</span>
        </div>`).join('')}`;
  } else {
    document.getElementById('report-detail').innerHTML = `
      <div class="empty-state" style="border:none;">
        <i data-lucide="bar-chart-3" class="empty-icon"></i>
        <p><strong>Nenhum dado para exibir.</strong></p>
        <p class="text-muted">Registre pacientes e procedimentos para ver o relatório.</p>
      </div>`;
  }

  lucide.createIcons();
}

function getMostCommonProcedureId(counts) {
  let maxId = '';
  let maxCount = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxId = id;
    }
  }
  return maxId;
}

function getMostCommonProcedure(counts) {
  const id = getMostCommonProcedureId(counts);
  if (!id) return '—';
  const proc = PROCEDURES.find(p => p.id === id);
  return proc ? proc.name : '—';
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
  // Enter no modal de paciente
  if (e.key === 'Enter' && document.getElementById('modal-add-patient').classList.contains('open')) {
    addPatient();
  }
});

// ===== RENDER ALL (chamado pelo firebase-sync após download) =====
function renderAll() {
  renderToday();
  populateMonthFilters();
  // Re-render tab ativa
  const activeTab = document.querySelector('.nav-btn.active');
  if (activeTab) {
    const tab = activeTab.getAttribute('onclick')?.match(/switchTab\('(.+?)'\)/)?.[1];
    if (tab === 'historico') renderHistory();
    if (tab === 'relatorios') renderReports();
  }
}

// ===== INIT =====
function init() {
  renderToday();
  populateMonthFilters();
}

init();
