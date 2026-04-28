// Firebase Config & Sync Module
const firebaseConfig = {
  apiKey: "AIzaSyDJDfqYb7AskuqcodAEwFp1ycqCHujUYdk",
  authDomain: "oftalmopro-a11e2.firebaseapp.com",
  projectId: "oftalmopro-a11e2",
  storageBucket: "oftalmopro-a11e2.firebasestorage.app",
  messagingSenderId: "672640137156",
  appId: "1:672640137156:web:f387e28a13d6d652915691"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Sync status indicator
let syncStatus = 'idle'; // idle, syncing, synced, error
let cloudSyncAvailable = true;

function isPermissionDenied(error) {
  return error && (
    error.code === 'permission-denied' ||
    String(error.message || '').toLowerCase().includes('missing or insufficient permissions')
  );
}

function handleCloudError(error, fallbackMessage = 'Modo local') {
  if (isPermissionDenied(error)) {
    cloudSyncAvailable = false;
    showSyncStatus('offline', fallbackMessage);
    return true;
  }
  return false;
}

function showSyncStatus(status, msg) {
  syncStatus = status;
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  if (dot) {
    dot.className = `sync-dot ${status}`;
  }
  if (text) {
    text.textContent = msg || status;
  }

  let indicator = document.getElementById('sync-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:8px 16px;border-radius:4px;font-size:12px;font-family:Inter,sans-serif;z-index:9999;transition:all 0.3s ease;display:flex;align-items:center;gap:6px;';
    document.body.appendChild(indicator);
  }
  const styles = {
    syncing: { bg: '#efe3c0', color: '#8a6b1c', icon: '⟳' },
    synced:  { bg: '#e6ebd8', color: '#2d5a3d', icon: '✓' },
    error:   { bg: '#f0d9d4', color: '#8b2e2e', icon: '✗' },
    offline: { bg: '#ebe5d6', color: '#8a847a', icon: '○' }
  };
  const s = styles[status] || styles.offline;
  indicator.style.background = s.bg;
  indicator.style.color = s.color;
  indicator.innerHTML = `<span style="font-size:14px">${s.icon}</span> ${msg || status}`;
  if (status === 'synced') {
    setTimeout(() => { indicator.style.opacity = '0.4'; }, 2000);
  } else {
    indicator.style.opacity = '1';
  }
}

// Upload patient registry to Firestore
async function uploadPatientsToFirestore() {
  if (!cloudSyncAvailable) return false;

  const raw = localStorage.getItem('oftalmopro_patients') || '[]';
  const patients = JSON.parse(raw);
  if (!patients.length) return false;

  await db.collection('crm').doc('patients').set({
    patients,
    updatedAt: new Date().toISOString()
  });
  return true;
}

// Download patient registry and merge by most recent updatedAt
async function downloadPatientsFromFirestore() {
  if (!cloudSyncAvailable) return false;

  try {
    const doc = await db.collection('crm').doc('patients').get();
    if (!doc.exists) return false;

    const cloudPatients = doc.data().patients || [];
    const localPatients = JSON.parse(localStorage.getItem('oftalmopro_patients') || '[]');
    const merged = new Map();

    [...localPatients, ...cloudPatients].forEach(patient => {
      if (!patient || !patient.id) return;
      const current = merged.get(patient.id);
      if (!current || String(patient.updatedAt || '') >= String(current.updatedAt || '')) {
        merged.set(patient.id, patient);
      }
    });

    const nextPatients = Array.from(merged.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    const changed = JSON.stringify(nextPatients) !== JSON.stringify(localPatients);
    if (changed) {
      localStorage.setItem('oftalmopro_patients', JSON.stringify(nextPatients));
    }
    return changed;
  } catch (e) {
    if (!handleCloudError(e, 'Cadastro local')) {
      console.warn('Patients download error', e);
    }
    return false;
  }
}

// Upload a single day to Firestore
async function uploadDayToFirestore(dateStr) {
  if (!cloudSyncAvailable) return false;

  try {
    const raw = localStorage.getItem('oftalmopro_' + dateStr);
    if (!raw) return false;
    const dayData = JSON.parse(raw);
    await db.collection('days').doc(dateStr).set(dayData);
    return true;
  } catch (e) {
    if (!handleCloudError(e, 'Salvo local')) {
      console.warn('Upload error for', dateStr, e);
    }
    return false;
  }
}

// Download all days from Firestore and merge into localStorage
async function downloadFromFirestore() {
  if (!cloudSyncAvailable) return false;

  try {
    showSyncStatus('syncing', 'Sincronizando...');
    const snapshot = await db.collection('days').get();
    const idx = JSON.parse(localStorage.getItem('oftalmopro_index') || '[]');
    let changed = false;
    snapshot.forEach(doc => {
      const dateStr = doc.id;
      const cloudData = doc.data();
      const localRaw = localStorage.getItem('oftalmopro_' + dateStr);
      const localData = localRaw ? JSON.parse(localRaw) : null;
      // Merge: cloud wins if local doesn't exist, otherwise keep the one with more patients
      if (!localData || (cloudData.patients && (!localData.patients || cloudData.patients.length > localData.patients.length))) {
        localStorage.setItem('oftalmopro_' + dateStr, JSON.stringify(cloudData));
        changed = true;
      }
      if (!idx.includes(dateStr)) {
        idx.push(dateStr);
        changed = true;
      }
    });
    if (changed) {
      idx.sort();
      localStorage.setItem('oftalmopro_index', JSON.stringify(idx));
    }
    const patientsChanged = await downloadPatientsFromFirestore();
    showSyncStatus('synced', 'Sincronizado');
    return changed || patientsChanged;
  } catch (e) {
    if (!handleCloudError(e, 'Modo local')) {
      console.warn('Download error:', e);
      showSyncStatus('error', 'Erro ao sincronizar');
    }
    return false;
  }
}

// Upload all local days to Firestore
async function uploadAllToFirestore() {
  if (!cloudSyncAvailable) {
    showSyncStatus('offline', 'Modo local');
    return false;
  }

  try {
    showSyncStatus('syncing', 'Enviando dados...');
    const idx = JSON.parse(localStorage.getItem('oftalmopro_index') || '[]');
    if (idx.length) {
      const batch = db.batch();
      idx.forEach(dateStr => {
        const raw = localStorage.getItem('oftalmopro_' + dateStr);
        if (raw) {
          const ref = db.collection('days').doc(dateStr);
          batch.set(ref, JSON.parse(raw));
        }
      });
      await batch.commit();
    }
    await uploadPatientsToFirestore();
    showSyncStatus('synced', 'Sincronizado');
    return true;
  } catch (e) {
    if (!handleCloudError(e, 'Modo local')) {
      console.warn('Upload all error:', e);
      showSyncStatus('error', 'Erro ao enviar');
    }
    return false;
  }
}

// Full sync: download then upload
async function fullSync() {
  if (!cloudSyncAvailable) return false;

  const changed = await downloadFromFirestore();
  await uploadAllToFirestore();
  return changed;
}

// Save and sync a specific day
async function saveAndSync(dateStr) {
  if (!cloudSyncAvailable) {
    showSyncStatus('offline', 'Salvo local');
    return false;
  }

  try {
    const synced = await uploadDayToFirestore(dateStr);
    showSyncStatus(synced ? 'synced' : 'offline', synced ? 'Salvo na nuvem' : 'Salvo local');
    return synced;
  } catch (e) {
    if (!handleCloudError(e, 'Salvo local')) {
      showSyncStatus('error', 'Erro - salvo local');
    }
    return false;
  }
}

// Save and sync patient registry
async function savePatientsAndSync() {
  if (!cloudSyncAvailable) {
    showSyncStatus('offline', 'Cadastro local');
    return false;
  }

  try {
    const synced = await uploadPatientsToFirestore();
    showSyncStatus(synced ? 'synced' : 'offline', synced ? 'Cadastro salvo' : 'Cadastro local');
    return synced;
  } catch (e) {
    if (!handleCloudError(e, 'Cadastro local')) {
      showSyncStatus('error', 'Erro - cadastro local');
    }
    return false;
  }
}

// Initial sync on page load
window.addEventListener('DOMContentLoaded', async () => {
  // Small delay to let app.js initialize first
  setTimeout(async () => {
    try {
      const changed = await fullSync();
      if (changed && typeof renderAll === 'function') {
        renderAll();
      }
    } catch (e) {
      showSyncStatus('offline', 'Modo offline');
    }
  }, 1000);
});
