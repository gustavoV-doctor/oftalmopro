// ===== CONFIGURACAO DE PROCEDIMENTOS =====
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

const PATIENTS_KEY = 'oftalmopro_patients';
const MIGRATION_KEY = 'oftalmopro_crm_migrated_v1';

let currentTab = 'hoje';
let currentSort = 'time';

// ===== UTILIDADES =====
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function storageKey(dateStr) {
  return `oftalmopro_${dateStr}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyParts(value) {
  const formatted = formatCurrency(value).replace('R$', '').trim();
  return `<span class="currency">R$</span>${formatted}`;
}

function formatDateBR(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  return `${d} ${getMonthName(parseInt(m, 10) - 1).slice(0, 3).toUpperCase()} ${y}`;
}

function getDayName(dateStr) {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const date = new Date(dateStr + 'T12:00:00');
  return days[date.getDay()];
}

function getMonthName(monthNum) {
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return months[monthNum] || '';
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
}

function isCurrentMonth(dateStr) {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return dateStr.startsWith(prefix);
}

function getTodayHeaderParts() {
  const now = new Date();
  const dateStr = getTodayStr();
  const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return {
    day: dayNames[now.getDay()],
    full: formatDateShort(dateStr),
  };
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function compactPatient(patient) {
  return {
    id: patient.id || generateId(),
    name: (patient.name || '').trim(),
    phone: (patient.phone || '').trim(),
    email: (patient.email || '').trim(),
    cpf: (patient.cpf || '').trim(),
    birth: patient.birth || '',
    address: (patient.address || '').trim(),
    tags: Array.isArray(patient.tags) ? patient.tags.filter(Boolean) : parseTags(patient.tags),
    notes: (patient.notes || '').trim(),
    createdAt: patient.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function getClinicalNoteText(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.trim();
  if (notes.text) return String(notes.text).trim();

  return [notes.complaint, notes.diagnosis, notes.conduct]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function createClinicalNotes(text = '') {
  return { text: String(text || '').trim() };
}

function renderClinicalText(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return escapeHTML(clean).replace(/\n/g, '<br>');
}

// ===== DADOS: DIAS =====
function loadDay(dateStr) {
  const raw = localStorage.getItem(storageKey(dateStr));
  if (!raw) return { date: dateStr, patients: [] };

  try {
    const data = JSON.parse(raw);
    return {
      date: data.date || dateStr,
      patients: Array.isArray(data.patients) ? data.patients : [],
    };
  } catch {
    return { date: dateStr, patients: [] };
  }
}

function saveDay(data) {
  localStorage.setItem(storageKey(data.date), JSON.stringify(data));
  saveDayToIndex(data.date);

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

function getDayIndex() {
  const raw = localStorage.getItem('oftalmopro_index');
  if (!raw) return [];
  try {
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ===== DADOS: PACIENTES =====
function loadPatients() {
  const raw = localStorage.getItem(PATIENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePatients(patients) {
  const clean = patients
    .filter(patient => patient && patient.name)
    .map(patient => compactPatient(patient))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  localStorage.setItem(PATIENTS_KEY, JSON.stringify(clean));

  if (typeof savePatientsAndSync === 'function') {
    savePatientsAndSync();
  }
}

function getPatientById(patientId) {
  return loadPatients().find(patient => patient.id === patientId) || null;
}

function findPatientByName(name) {
  const target = normalizeText(name);
  if (!target) return null;
  return loadPatients().find(patient => normalizeText(patient.name) === target) || null;
}

function upsertPatient(patientData) {
  const patients = loadPatients();
  const clean = compactPatient(patientData);
  const existingIndex = patients.findIndex(patient => patient.id === clean.id);

  if (existingIndex >= 0) {
    patients[existingIndex] = {
      ...patients[existingIndex],
      ...clean,
      createdAt: patients[existingIndex].createdAt || clean.createdAt,
      updatedAt: nowIso(),
    };
  } else {
    patients.push(clean);
  }

  savePatients(patients);
  return clean;
}

function ensurePatientFromName(name) {
  const existing = findPatientByName(name);
  if (existing) return existing;
  return upsertPatient({ id: generateId(), name });
}

function getVisitPatient(visit) {
  return getPatientById(visit.patientId) || findPatientByName(visit.name) || {
    id: visit.patientId || '',
    name: visit.name || 'Paciente sem nome',
    phone: '',
    email: '',
    cpf: '',
    tags: [],
    notes: '',
  };
}

function migrateLegacyData() {
  const patients = loadPatients();
  const byName = new Map(patients.map(patient => [normalizeText(patient.name), patient]));
  let changedDays = false;
  let changedPatients = false;

  getDayIndex().forEach(dateStr => {
    const data = loadDay(dateStr);
    let changedDay = false;

    data.patients = data.patients.map(visit => {
      if (visit.patientId) return {
        ...visit,
        clinicalNotes: createClinicalNotes(getClinicalNoteText(visit.clinicalNotes)),
      };

      const name = (visit.name || '').trim();
      if (!name) return visit;

      let patient = byName.get(normalizeText(name));
      if (!patient) {
        patient = compactPatient({ id: generateId(), name });
        patients.push(patient);
        byName.set(normalizeText(name), patient);
        changedPatients = true;
      }

      changedDay = true;
      return {
        ...visit,
        patientId: patient.id,
        clinicalNotes: createClinicalNotes(getClinicalNoteText(visit.clinicalNotes)),
      };
    });

    if (changedDay) {
      localStorage.setItem(storageKey(dateStr), JSON.stringify(data));
      changedDays = true;
    }
  });

  if (changedPatients) {
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))));
  }

  localStorage.setItem(MIGRATION_KEY, 'true');

  if (changedDays && typeof uploadAllToFirestore === 'function') {
    uploadAllToFirestore();
  }
  if (changedPatients && typeof savePatientsAndSync === 'function') {
    savePatientsAndSync();
  }
}

// ===== CALCULOS =====
function calculatePatientTotal(visit) {
  return (visit.procedures || []).reduce((sum, procId) => {
    const proc = PROCEDURES.find(item => item.id === procId);
    return sum + (proc ? proc.price : 0);
  }, 0);
}

function calculateDayTotal(dateStr) {
  const data = loadDay(dateStr);
  return data.patients.reduce((sum, visit) => sum + calculatePatientTotal(visit), 0);
}

function getAllVisits() {
  return getDayIndex().flatMap(dateStr => {
    const data = loadDay(dateStr);
    return data.patients.map(visit => ({ ...visit, date: dateStr }));
  });
}

function getPatientVisits(patientId, fallbackName = '') {
  const normalizedName = normalizeText(fallbackName);
  return getAllVisits()
    .filter(visit => visit.patientId === patientId || (!visit.patientId && normalizeText(visit.name) === normalizedName))
    .sort((a, b) => (`${b.date} ${b.time || ''}`).localeCompare(`${a.date} ${a.time || ''}`));
}

function getPatientStats(patient) {
  const visits = getPatientVisits(patient.id, patient.name);
  const ltv = visits.reduce((sum, visit) => sum + calculatePatientTotal(visit), 0);
  return {
    visits,
    ltv,
    count: visits.length,
    lastVisit: visits[0]?.date || '',
  };
}

function getMonthlyTotal() {
  return getDayIndex()
    .filter(isCurrentMonth)
    .reduce((sum, dateStr) => sum + calculateDayTotal(dateStr), 0);
}

// ===== NAVEGACAO =====
function switchTab(tab) {
  currentTab = tab;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tab}`);
  });

  if (tab === 'hoje') renderToday();
  if (tab === 'pacientes') renderPatientsList();
  if (tab === 'historico') renderHistory();
  if (tab === 'relatorios') renderReports();

  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

// ===== MODAIS =====
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function openAddVisitModal() {
  document.getElementById('visit-patient-name').value = '';
  document.getElementById('visit-patient-id').value = '';
  document.getElementById('visit-time').value = '';
  document.getElementById('visit-notes').value = '';
  document.getElementById('autocomplete-list').innerHTML = '';
  document.getElementById('autocomplete-list').classList.remove('visible');
  document.getElementById('autocomplete-hint').innerHTML = '';
  openModal('modal-add-visit');
  setTimeout(() => document.getElementById('visit-patient-name').focus(), 80);
}

function openPatientFormModal(patientId = '') {
  const patient = patientId ? getPatientById(patientId) : null;

  document.getElementById('patient-form-title').innerHTML = patient ? 'Editar <em>cadastro</em>' : 'Novo <em>cadastro</em>';
  document.getElementById('pf-id').value = patient?.id || '';
  document.getElementById('pf-name').value = patient?.name || '';
  document.getElementById('pf-phone').value = patient?.phone || '';
  document.getElementById('pf-email').value = patient?.email || '';
  document.getElementById('pf-birth').value = patient?.birth || '';
  document.getElementById('pf-cpf').value = patient?.cpf || '';
  document.getElementById('pf-address').value = patient?.address || '';
  document.getElementById('pf-tags').value = (patient?.tags || []).join(', ');
  document.getElementById('pf-notes').value = patient?.notes || '';
  document.getElementById('pf-delete-btn').style.display = patient ? 'inline-flex' : 'none';

  openModal('modal-patient-form');
  setTimeout(() => document.getElementById('pf-name').focus(), 80);
}

function savePatientForm() {
  const id = document.getElementById('pf-id').value || generateId();
  const name = document.getElementById('pf-name').value.trim();

  if (!name) {
    alert('Digite o nome completo do paciente.');
    return;
  }

  const existing = getPatientById(id);
  const patient = upsertPatient({
    id,
    name,
    phone: document.getElementById('pf-phone').value,
    email: document.getElementById('pf-email').value,
    birth: document.getElementById('pf-birth').value,
    cpf: document.getElementById('pf-cpf').value,
    address: document.getElementById('pf-address').value,
    tags: parseTags(document.getElementById('pf-tags').value),
    notes: document.getElementById('pf-notes').value,
    createdAt: existing?.createdAt,
  });

  updateVisitNamesForPatient(patient);
  closeModal('modal-patient-form');
  renderAll();

  if (document.getElementById('modal-patient-profile').classList.contains('open')) {
    showPatientProfile(patient.id);
  }
}

function updateVisitNamesForPatient(patient) {
  getDayIndex().forEach(dateStr => {
    const data = loadDay(dateStr);
    let changed = false;
    data.patients = data.patients.map(visit => {
      if (visit.patientId !== patient.id) return visit;
      changed = true;
      return { ...visit, name: patient.name };
    });
    if (changed) saveDay(data);
  });
}

function deletePatientFromForm() {
  const patientId = document.getElementById('pf-id').value;
  if (!patientId) return;

  const stats = getPatientStats(getPatientById(patientId));
  if (stats.count > 0) {
    alert('Este paciente tem atendimentos no histórico. Remova os atendimentos antes de excluir o cadastro.');
    return;
  }

  if (!confirm('Excluir este cadastro de paciente?')) return;

  savePatients(loadPatients().filter(patient => patient.id !== patientId));
  closeModal('modal-patient-form');
  closeModal('modal-patient-profile');
  renderAll();
}

// ===== ATENDIMENTOS DO DIA =====
function onVisitNameInput() {
  const input = document.getElementById('visit-patient-name');
  const hidden = document.getElementById('visit-patient-id');
  const query = input.value.trim();
  const list = document.getElementById('autocomplete-list');
  const hint = document.getElementById('autocomplete-hint');

  hidden.value = '';

  if (!query) {
    list.classList.remove('visible');
    list.innerHTML = '';
    hint.innerHTML = 'Digite para buscar no cadastro ou criar um paciente novo.';
    return;
  }

  const matches = loadPatients()
    .filter(patient => {
      const haystack = normalizeText(`${patient.name} ${patient.phone} ${patient.cpf}`);
      return haystack.includes(normalizeText(query));
    })
    .slice(0, 6);

  if (!matches.length) {
    list.classList.remove('visible');
    list.innerHTML = '';
    hint.innerHTML = `Nenhum cadastro encontrado. Ao salvar, <a onclick="openPatientFormModal()">crie um cadastro completo</a> ou continue para criar com o nome informado.`;
    return;
  }

  list.innerHTML = matches.map(patient => `
    <button type="button" class="autocomplete-item" onclick="selectAutocompletePatient('${patient.id}')">
      <span>${escapeHTML(patient.name)}</span>
      <span class="ac-meta">${escapeHTML(patient.phone || patient.cpf || 'Cadastro')}</span>
    </button>
  `).join('');
  list.classList.add('visible');
  hint.innerHTML = `${matches.length} cadastro${matches.length > 1 ? 's' : ''} encontrado${matches.length > 1 ? 's' : ''}.`;
}

function selectAutocompletePatient(patientId) {
  const patient = getPatientById(patientId);
  if (!patient) return;

  document.getElementById('visit-patient-name').value = patient.name;
  document.getElementById('visit-patient-id').value = patient.id;
  document.getElementById('autocomplete-list').classList.remove('visible');
  document.getElementById('autocomplete-hint').textContent = patient.phone || patient.cpf || 'Paciente selecionado do cadastro.';
}

function hideAutocomplete() {
  setTimeout(() => document.getElementById('autocomplete-list')?.classList.remove('visible'), 180);
}

function saveVisit() {
  const name = document.getElementById('visit-patient-name').value.trim();
  const time = document.getElementById('visit-time').value || '--:--';
  let patientId = document.getElementById('visit-patient-id').value;

  if (!name) {
    alert('Digite ou selecione um paciente.');
    return;
  }

  let patient = patientId ? getPatientById(patientId) : findPatientByName(name);
  if (!patient) {
    patient = ensurePatientFromName(name);
  }
  patientId = patient.id;

  const today = getTodayStr();
  const data = loadDay(today);

  data.patients.push({
    id: generateId(),
    patientId,
    name: patient.name,
    time,
    procedures: [],
    clinicalNotes: createClinicalNotes(document.getElementById('visit-notes').value),
    createdAt: nowIso(),
  });

  sortVisits(data.patients);
  saveDay(data);
  closeModal('modal-add-visit');
  renderAll();
}

function deleteVisit(visitId) {
  if (!confirm('Remover este atendimento do dia?')) return;

  const today = getTodayStr();
  const data = loadDay(today);
  data.patients = data.patients.filter(visit => visit.id !== visitId);
  saveDay(data);
  renderAll();
}

function toggleProcedure(visitId, procedureId) {
  const today = getTodayStr();
  const data = loadDay(today);
  const visit = data.patients.find(item => item.id === visitId);
  if (!visit) return;

  if (!Array.isArray(visit.procedures)) visit.procedures = [];

  const existingIndex = visit.procedures.indexOf(procedureId);
  if (existingIndex >= 0) {
    visit.procedures.splice(existingIndex, 1);
  } else {
    visit.procedures.push(procedureId);
  }

  saveDay(data);
  renderAll();
}

function openClinicalNotes(visitId, dateStr = getTodayStr()) {
  const data = loadDay(dateStr);
  const visit = data.patients.find(item => item.id === visitId);
  if (!visit) return;

  const notes = visit.clinicalNotes || {};
  document.getElementById('cn-visit-id').value = `${dateStr}|${visitId}`;
  document.getElementById('cn-notes').value = getClinicalNoteText(notes);
  openModal('modal-clinical');
}

function saveClinicalNotes() {
  const [dateStr, visitId] = document.getElementById('cn-visit-id').value.split('|');
  const data = loadDay(dateStr);
  const visit = data.patients.find(item => item.id === visitId);
  if (!visit) return;

  visit.clinicalNotes = createClinicalNotes(document.getElementById('cn-notes').value);

  saveDay(data);
  closeModal('modal-clinical');
  renderAll();

  if (document.getElementById('modal-day-detail').classList.contains('open')) {
    showDayDetail(dateStr);
  }
  if (document.getElementById('modal-patient-profile').classList.contains('open') && visit.patientId) {
    showPatientProfile(visit.patientId);
  }
}

function toggleSort() {
  currentSort = currentSort === 'time' ? 'name' : 'time';
  document.getElementById('sort-label').textContent = currentSort === 'time' ? 'Por horário' : 'Por nome';
  renderToday();
}

function sortVisits(visits) {
  visits.sort((a, b) => {
    if (currentSort === 'name') return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    if (a.time === '--:--') return 1;
    if (b.time === '--:--') return -1;
    return String(a.time || '').localeCompare(String(b.time || ''));
  });
}

// ===== RENDER: HOJE =====
function renderToday() {
  const today = getTodayStr();
  const data = loadDay(today);
  const dateParts = getTodayHeaderParts();
  const visits = [...data.patients];
  sortVisits(visits);

  document.getElementById('header-day').textContent = dateParts.day;
  document.getElementById('header-date').textContent = dateParts.full;

  const dailyTotal = data.patients.reduce((sum, visit) => sum + calculatePatientTotal(visit), 0);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const yesterdayTotal = calculateDayTotal(yesterdayStr);
  const monthlyTotal = getMonthlyTotal();
  const avgTicket = data.patients.length ? dailyTotal / data.patients.length : 0;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Faturamento</div>
      <div class="kpi-value">${formatCurrencyParts(dailyTotal)}</div>
      <div class="kpi-sub">${dailyTotal - yesterdayTotal >= 0 ? '+' : ''}${formatCurrency(dailyTotal - yesterdayTotal)} vs ontem</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Pacientes</div>
      <div class="kpi-value">${data.patients.length}</div>
      <div class="kpi-sub">${loadPatients().length} no cadastro</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Ticket médio</div>
      <div class="kpi-value">${formatCurrencyParts(avgTicket)}</div>
      <div class="kpi-sub">por paciente</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Mês corrente</div>
      <div class="kpi-value">${formatCurrencyParts(monthlyTotal)}</div>
      <div class="kpi-sub">${getAllVisits().filter(visit => isCurrentMonth(visit.date)).length} atendimentos</div>
    </div>
  `;

  const listEl = document.getElementById('patient-list');
  if (!visits.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p class="empty-title"><em>Nenhum paciente registrado hoje.</em></p>
        <p class="empty-sub">Adicione o primeiro atendimento do dia.</p>
        <button class="btn-dark" onclick="openAddVisitModal()"><i data-lucide="plus"></i> Novo paciente</button>
      </div>`;
    refreshIcons();
    return;
  }

  listEl.innerHTML = visits.map(visit => renderVisitCard(visit)).join('');
  refreshIcons();
}

function renderVisitCard(visit) {
  const patient = getVisitPatient(visit);
  const total = calculatePatientTotal(visit);
  const tags = (patient.tags || []).slice(0, 4).map(tag => `<span class="tag-chip">${escapeHTML(tag)}</span>`).join('');
  const hasClinical = Boolean(getClinicalNoteText(visit.clinicalNotes));
  const chips = PROCEDURES.map(proc => {
    const active = (visit.procedures || []).includes(proc.id);
    return `<button class="procedure-chip ${active ? 'active' : ''}" onclick="toggleProcedure('${visit.id}', '${proc.id}')">
      ${escapeHTML(proc.name)} <span class="price">${formatCurrency(proc.price)}</span>
    </button>`;
  }).join('');

  return `
    <div class="patient-card">
      <div class="patient-header">
        <div class="patient-info">
          <button class="patient-avatar" onclick="showPatientProfile('${patient.id}')" title="Abrir perfil">${escapeHTML(getInitials(patient.name))}</button>
          <div>
            <div class="patient-name">${escapeHTML(patient.name)}</div>
            <div class="patient-meta">
              <span>${escapeHTML(visit.time || '--:--')}</span>
              <span class="patient-meta-divider">/</span>
              <span>${escapeHTML(patient.phone || patient.cpf || 'Cadastro básico')}</span>
            </div>
            ${tags ? `<div class="patient-tags">${tags}</div>` : ''}
          </div>
        </div>
        <div class="patient-actions-right">
          <div class="patient-total"><span class="currency">Total</span>${formatCurrency(total).replace('R$', '').trim()}</div>
          <div class="patient-action-buttons">
            <button class="btn-icon" onclick="openClinicalNotes('${visit.id}')" title="Anotações clínicas">
              <i data-lucide="${hasClinical ? 'clipboard-check' : 'clipboard-plus'}"></i>
            </button>
            <button class="btn-icon" onclick="openPreviousVisitsPanel('${patient.id}')" title="Consultas anteriores">
              <i data-lucide="panel-right-open"></i>
            </button>
            <button class="btn-icon" onclick="showPatientProfile('${patient.id}')" title="Perfil">
              <i data-lucide="user-round"></i>
            </button>
            <button class="btn-icon danger" onclick="deleteVisit('${visit.id}')" title="Remover atendimento">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="procedures-grid">${chips}</div>
    </div>`;
}

// ===== RENDER: PACIENTES =====
function populatePatientTagFilter() {
  const select = document.getElementById('patients-tag-filter');
  if (!select) return;

  const current = select.value;
  const tags = Array.from(new Set(loadPatients().flatMap(patient => patient.tags || []))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  select.innerHTML = '<option value="">Todas as tags</option>' + tags.map(tag =>
    `<option value="${escapeHTML(tag)}" ${tag === current ? 'selected' : ''}>${escapeHTML(tag)}</option>`
  ).join('');
}

function renderPatientsList() {
  populatePatientTagFilter();

  const query = normalizeText(document.getElementById('patients-search')?.value || '');
  const tag = document.getElementById('patients-tag-filter')?.value || '';
  const patients = loadPatients().filter(patient => {
    const haystack = normalizeText(`${patient.name} ${patient.phone} ${patient.email} ${patient.cpf} ${patient.address} ${(patient.tags || []).join(' ')}`);
    const matchesQuery = !query || haystack.includes(query);
    const matchesTag = !tag || (patient.tags || []).includes(tag);
    return matchesQuery && matchesTag;
  });

  document.getElementById('patients-count').textContent = `${loadPatients().length} paciente${loadPatients().length === 1 ? '' : 's'}`;
  const grid = document.getElementById('patients-grid');

  if (!patients.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1 / -1;">
        <p class="empty-title"><em>Nenhum paciente encontrado.</em></p>
        <p class="empty-sub">Cadastre ou ajuste a busca para encontrar o prontuário.</p>
        <button class="btn-dark" onclick="openPatientFormModal()"><i data-lucide="user-plus"></i> Novo cadastro</button>
      </div>`;
    refreshIcons();
    return;
  }

  grid.innerHTML = patients.map(patient => {
    const stats = getPatientStats(patient);
    const tags = (patient.tags || []).slice(0, 3).map(item => `<span class="tag-chip">${escapeHTML(item)}</span>`).join('');
    return `
      <button class="patient-card-crm" onclick="showPatientProfile('${patient.id}')">
        <div class="patient-card-crm-header">
          <span class="patient-avatar">${escapeHTML(getInitials(patient.name))}</span>
          <span>
            <span class="name">${escapeHTML(patient.name)}</span>
            <span class="phone">${escapeHTML(patient.phone || patient.email || patient.cpf || 'Cadastro sem contato')}</span>
          </span>
        </div>
        ${tags ? `<div class="patient-tags">${tags}</div>` : ''}
        <div class="patient-card-crm-stats">
          <span><span class="num">${stats.count}</span> consultas</span>
          <span><span class="num">${formatCurrency(stats.ltv)}</span> LTV</span>
          <span><span class="num">${stats.lastVisit ? formatDateBR(stats.lastVisit) : '--'}</span> última</span>
        </div>
      </button>`;
  }).join('');
  refreshIcons();
}

function showPatientProfile(patientId) {
  const patient = getPatientById(patientId);
  if (!patient) return;

  const stats = getPatientStats(patient);
  const infoRows = [
    ['phone', patient.phone],
    ['mail', patient.email],
    ['badge', patient.cpf],
    ['calendar', patient.birth ? formatDateBR(patient.birth) : ''],
    ['map-pin', patient.address],
  ].filter(([, value]) => value);

  document.getElementById('profile-title').textContent = patient.name;
  document.getElementById('profile-edit-btn').onclick = () => openPatientFormModal(patient.id);

  document.getElementById('profile-body').innerHTML = `
    <div class="profile-grid">
      <aside class="profile-side">
        <div class="profile-avatar">${escapeHTML(getInitials(patient.name))}</div>
        <div class="profile-name">${escapeHTML(patient.name)}</div>
        ${infoRows.map(([icon, value]) => `
          <div class="profile-info-row"><i data-lucide="${icon}"></i><span>${escapeHTML(value)}</span></div>
        `).join('') || '<div class="profile-info-row">Cadastro sem contato detalhado.</div>'}
        <div class="profile-stats">
          <div class="profile-stat"><div class="num">${stats.count}</div><div class="label">Consultas</div></div>
          <div class="profile-stat"><div class="num">${formatCurrency(stats.ltv)}</div><div class="label">LTV</div></div>
        </div>
      </aside>
      <div class="profile-main">
        <h4>Cadastro</h4>
        ${(patient.tags || []).length ? `<div class="profile-tags">${patient.tags.map(tag => `<span class="tag-chip">${escapeHTML(tag)}</span>`).join('')}</div>` : '<p class="text-muted">Sem tags.</p>'}
        <h4>Observações clínicas</h4>
        <div class="profile-notes">${escapeHTML(patient.notes || 'Sem observações gerais no cadastro.')}</div>
        <h4>Histórico de consultas</h4>
        ${renderPatientHistory(stats.visits)}
      </div>
    </div>`;

  openModal('modal-patient-profile');
  refreshIcons();
}

function renderPatientHistory(visits) {
  if (!visits.length) return '<p class="text-muted">Nenhuma consulta registrada para este paciente.</p>';

  return visits.map(visit => {
    const noteText = getClinicalNoteText(visit.clinicalNotes);
    const procs = (visit.procedures || []).map(procId => {
      const proc = PROCEDURES.find(item => item.id === procId);
      return proc ? `<span class="proc-tag">${escapeHTML(proc.name)}</span>` : '';
    }).join('');
    const clinical = noteText ? `<div class="profile-visit-clinical">${renderClinicalText(noteText)}</div>` : '';

    return `
      <div class="profile-visit">
        <div class="profile-visit-header">
          <div class="profile-visit-date">${formatDateBR(visit.date)} · ${escapeHTML(getDayName(visit.date))} · ${escapeHTML(visit.time || '--:--')}</div>
          <div class="profile-visit-total">${formatCurrency(calculatePatientTotal(visit))}</div>
        </div>
        <div class="profile-visit-procs">${procs || '<span class="text-muted">Sem procedimentos</span>'}</div>
        ${clinical}
        <button class="btn-link" onclick="openClinicalNotes('${visit.id}', '${visit.date}')">Editar anotações</button>
      </div>`;
  }).join('');
}

function openPreviousVisitsFromVisitModal() {
  const patientId = document.getElementById('visit-patient-id').value;
  const name = document.getElementById('visit-patient-name').value.trim();
  const patient = patientId ? getPatientById(patientId) : findPatientByName(name);

  if (patient) {
    openPreviousVisitsPanel(patient.id);
    return;
  }

  openPreviousVisitsPanel('', name);
}

function openPreviousVisitsPanel(patientId = '', fallbackName = '') {
  const patient = patientId ? getPatientById(patientId) : findPatientByName(fallbackName);
  const displayName = patient?.name || fallbackName || 'Paciente';
  const visits = patient
    ? getPatientVisits(patient.id, patient.name)
    : getAllVisits().filter(visit => normalizeText(visit.name) === normalizeText(fallbackName));

  document.getElementById('previous-visits-title').textContent = `Consultas anteriores · ${displayName}`;
  document.getElementById('previous-visits-body').innerHTML = renderPreviousVisitsDrawer(visits);
  document.getElementById('previous-visits-panel').classList.add('open');
  refreshIcons();
}

function closePreviousVisitsPanel() {
  document.getElementById('previous-visits-panel').classList.remove('open');
}

function renderPreviousVisitsDrawer(visits) {
  if (!visits.length) {
    return `
      <div class="empty-state side-empty">
        <p class="empty-title"><em>Nenhuma consulta anterior.</em></p>
        <p class="empty-sub">Quando houver histórico, ele aparecerá aqui sem tirar você do atendimento atual.</p>
      </div>`;
  }

  return visits.map(visit => {
    const noteText = getClinicalNoteText(visit.clinicalNotes);
    const procs = (visit.procedures || []).map(procId => {
      const proc = PROCEDURES.find(item => item.id === procId);
      return proc ? `<span class="proc-tag">${escapeHTML(proc.name)}</span>` : '';
    }).join('');

    return `
      <article class="drawer-visit">
        <div class="drawer-visit-header">
          <div>
            <div class="profile-visit-date">${formatDateBR(visit.date)} · ${escapeHTML(visit.time || '--:--')}</div>
            <div class="text-muted">${escapeHTML(getDayName(visit.date))}</div>
          </div>
          <strong>${formatCurrency(calculatePatientTotal(visit))}</strong>
        </div>
        <div class="profile-visit-procs">${procs || '<span class="text-muted">Sem procedimentos</span>'}</div>
        ${noteText ? `<div class="profile-visit-clinical">${renderClinicalText(noteText)}</div>` : '<p class="text-muted">Sem anotações registradas.</p>'}
        <button class="btn-link" onclick="openClinicalNotes('${visit.id}', '${visit.date}')">Editar esta anotação</button>
      </article>`;
  }).join('');
}

// ===== RENDER: HISTORICO =====
function populateMonthFilters() {
  const months = Array.from(new Set(getDayIndex().map(dateStr => dateStr.slice(0, 7)))).sort().reverse();

  ['filter-month', 'report-month'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Todos os meses</option>' + months.map(ym => {
      const [year, month] = ym.split('-');
      const label = `${getMonthName(parseInt(month, 10) - 1)} ${year}`;
      return `<option value="${ym}" ${ym === current ? 'selected' : ''}>${label}</option>`;
    }).join('');
  });
}

function renderHistory() {
  populateMonthFilters();
  const filterMonth = document.getElementById('filter-month').value;
  let dates = getDayIndex();

  if (filterMonth) dates = dates.filter(dateStr => dateStr.startsWith(filterMonth));
  dates = dates.slice().sort().reverse();

  const rows = dates.map(dateStr => {
    const data = loadDay(dateStr);
    return {
      dateStr,
      patientCount: data.patients.length,
      dayTotal: data.patients.reduce((sum, visit) => sum + calculatePatientTotal(visit), 0),
    };
  }).filter(row => row.patientCount > 0 || row.dayTotal > 0);

  const totalDays = rows.length;
  const totalPatients = rows.reduce((sum, row) => sum + row.patientCount, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.dayTotal, 0);
  const avgPerDay = totalDays ? totalRevenue / totalDays : 0;

  document.getElementById('history-summary').innerHTML = `
    <div class="kpi"><div class="kpi-label">Dias trabalhados</div><div class="kpi-value">${totalDays}</div><div class="kpi-sub">com atendimento</div></div>
    <div class="kpi"><div class="kpi-label">Pacientes</div><div class="kpi-value">${totalPatients}</div><div class="kpi-sub">atendimentos no período</div></div>
    <div class="kpi"><div class="kpi-label">Faturamento</div><div class="kpi-value">${formatCurrencyParts(totalRevenue)}</div><div class="kpi-sub">total do período</div></div>
    <div class="kpi"><div class="kpi-label">Média por dia</div><div class="kpi-value">${formatCurrencyParts(avgPerDay)}</div><div class="kpi-sub">receita média</div></div>
  `;

  const wrapper = document.querySelector('.history-table-wrapper');
  const empty = document.getElementById('history-empty');
  const tbody = document.getElementById('history-body');

  if (!rows.length) {
    wrapper.style.display = 'none';
    empty.style.display = 'block';
    refreshIcons();
    return;
  }

  wrapper.style.display = 'block';
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${formatDateBR(row.dateStr)}</td>
      <td>${escapeHTML(getDayName(row.dateStr))}</td>
      <td>${row.patientCount}</td>
      <td class="amount">${formatCurrency(row.dayTotal)}</td>
      <td><button class="btn-link" onclick="showDayDetail('${row.dateStr}')">Ver detalhes</button></td>
    </tr>
  `).join('');
  refreshIcons();
}

function showDayDetail(dateStr) {
  const data = loadDay(dateStr);
  const dayTotal = data.patients.reduce((sum, visit) => sum + calculatePatientTotal(visit), 0);
  document.getElementById('detail-day-title').textContent = `${getDayName(dateStr)}, ${formatDateBR(dateStr)} · ${formatCurrency(dayTotal)}`;

  const body = document.getElementById('detail-day-body');
  if (!data.patients.length) {
    body.innerHTML = '<p class="text-muted">Nenhum atendimento neste dia.</p>';
  } else {
    body.innerHTML = data.patients.map(visit => {
      const patient = getVisitPatient(visit);
      const noteText = getClinicalNoteText(visit.clinicalNotes);
      const procs = (visit.procedures || []).map(procId => {
        const proc = PROCEDURES.find(item => item.id === procId);
        return proc ? `<span class="proc-tag">${escapeHTML(proc.name)} · ${formatCurrency(proc.price)}</span>` : '';
      }).join('');
      return `
        <div class="detail-patient">
          <div class="detail-patient-header">
            <div>
              <span class="detail-patient-name">${escapeHTML(patient.name)}</span>
              <span class="detail-patient-time">${escapeHTML(visit.time || '--:--')}</span>
            </div>
            <span class="detail-patient-total">${formatCurrency(calculatePatientTotal(visit))}</span>
          </div>
          <div class="detail-procedures">${procs || '<span class="text-muted">Sem procedimentos</span>'}</div>
          ${noteText ? `<div class="profile-visit-clinical">${renderClinicalText(noteText)}</div>` : ''}
          <button class="btn-link" onclick="openClinicalNotes('${visit.id}', '${dateStr}')">Editar anotações</button>
        </div>`;
    }).join('');
  }

  openModal('modal-day-detail');
  refreshIcons();
}

// ===== RENDER: RELATORIOS =====
function renderReports() {
  populateMonthFilters();
  const filterMonth = document.getElementById('report-month').value;
  let visits = getAllVisits();

  if (filterMonth) visits = visits.filter(visit => visit.date.startsWith(filterMonth));

  const procedureCounts = {};
  const procedureRevenue = {};
  PROCEDURES.forEach(proc => {
    procedureCounts[proc.id] = 0;
    procedureRevenue[proc.id] = 0;
  });

  const days = new Set();
  const uniquePatients = new Set();
  let totalRevenue = 0;

  visits.forEach(visit => {
    days.add(visit.date);
    uniquePatients.add(visit.patientId || normalizeText(visit.name));
    totalRevenue += calculatePatientTotal(visit);

    (visit.procedures || []).forEach(procId => {
      const proc = PROCEDURES.find(item => item.id === procId);
      if (!proc) return;
      procedureCounts[procId]++;
      procedureRevenue[procId] += proc.price;
    });
  });

  const totalDays = days.size;
  const avgPerDay = totalDays ? totalRevenue / totalDays : 0;
  const avgTicket = visits.length ? totalRevenue / visits.length : 0;
  const mostCommonId = getMostCommonProcedureId(procedureCounts);
  const mostCommon = PROCEDURES.find(proc => proc.id === mostCommonId)?.name || '--';

  document.getElementById('report-cards').innerHTML = `
    <div class="kpi"><div class="kpi-label">Faturamento</div><div class="kpi-value">${formatCurrencyParts(totalRevenue)}</div><div class="kpi-sub">${totalDays} dias trabalhados</div></div>
    <div class="kpi"><div class="kpi-label">Ticket médio</div><div class="kpi-value">${formatCurrencyParts(avgTicket)}</div><div class="kpi-sub">por atendimento</div></div>
    <div class="kpi"><div class="kpi-label">Pacientes únicos</div><div class="kpi-value">${uniquePatients.size}</div><div class="kpi-sub">${visits.length} atendimentos</div></div>
    <div class="kpi"><div class="kpi-label">Mais feito</div><div class="kpi-value" style="font-size:2rem;">${escapeHTML(mostCommon)}</div><div class="kpi-sub">${procedureCounts[mostCommonId] || 0} vezes · ${formatCurrency(avgPerDay)}/dia</div></div>
  `;

  const maxRevenue = Math.max(...Object.values(procedureRevenue), 1);
  const rows = PROCEDURES.map(proc => ({
    ...proc,
    count: procedureCounts[proc.id],
    revenue: procedureRevenue[proc.id],
  })).filter(proc => proc.count > 0).sort((a, b) => b.revenue - a.revenue);

  const detail = document.getElementById('report-detail');
  if (!rows.length) {
    detail.innerHTML = `
      <div class="empty-state" style="border:none;">
        <p class="empty-title"><em>Nenhum dado financeiro.</em></p>
        <p class="empty-sub">Registre atendimentos e procedimentos para ver o relatório.</p>
      </div>`;
  } else {
    detail.innerHTML = rows.map(proc => `
      <div class="procedure-row">
        <span class="name">${escapeHTML(proc.name)}</span>
        <span class="count">${proc.count}x</span>
        <div class="procedure-bar"><div class="procedure-bar-fill" style="width:${(proc.revenue / maxRevenue * 100).toFixed(0)}%"></div></div>
        <span class="total">${formatCurrency(proc.revenue)}</span>
      </div>
    `).join('');
  }
  refreshIcons();
}

function getMostCommonProcedureId(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

// ===== EVENTOS =====
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(modal => modal.classList.remove('open'));
  }

  if (
    event.key === 'Enter' &&
    document.getElementById('modal-add-visit')?.classList.contains('open') &&
    event.target.tagName !== 'TEXTAREA'
  ) {
    saveVisit();
  }
});

// ===== RENDER ALL =====
function renderAll() {
  migrateLegacyData();
  populateMonthFilters();
  populatePatientTagFilter();

  if (currentTab === 'hoje') renderToday();
  if (currentTab === 'pacientes') renderPatientsList();
  if (currentTab === 'historico') renderHistory();
  if (currentTab === 'relatorios') renderReports();
}

function init() {
  migrateLegacyData();
  renderToday();
  populateMonthFilters();
  populatePatientTagFilter();
  refreshIcons();
}

init();
