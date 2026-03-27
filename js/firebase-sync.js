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

function showSyncStatus(status, msg) {
  syncStatus = status;
  let indicator = document.getElementById('sync-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.style.cssText = 'position:fixed;bottom:16px;right:16px;padding:8px 16px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif;z-index:9999;transition:all 0.3s ease;display:flex;align-items:center;gap:6px;';
    document.body.appendChild(indicator);
  }
  const styles = {
    syncing: { bg: '#2d3748', color: '#fbd38d', icon: '⟳' },
    synced:  { bg: '#1a3a2a', color: '#68d391', icon: '✓' },
    error:   { bg: '#3a1a1a', color: '#fc8181', icon: '✗' },
    offline: { bg: '#2d3748', color: '#a0aec0', icon: '○' }
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

// Upload a single day to Firestore
async function uploadDayToFirestore(dateStr) {
  try {
    const raw = localStorage.getItem('oftalmopro_' + dateStr);
    if (!raw) return;
    const dayData = JSON.parse(raw);
    await db.collection('days').doc(dateStr).set(dayData);
  } catch (e) {
    console.error('Upload error for', dateStr, e);
  }
}

// Download all days from Firestore and merge into localStorage
async function downloadFromFirestore() {
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
    showSyncStatus('synced', 'Sincronizado');
    return changed;
  } catch (e) {
    console.error('Download error:', e);
    showSyncStatus('error', 'Erro ao sincronizar');
    return false;
  }
}

// Upload all local days to Firestore
async function uploadAllToFirestore() {
  try {
    showSyncStatus('syncing', 'Enviando dados...');
    const idx = JSON.parse(localStorage.getItem('oftalmopro_index') || '[]');
    const batch = db.batch();
    idx.forEach(dateStr => {
      const raw = localStorage.getItem('oftalmopro_' + dateStr);
      if (raw) {
        const ref = db.collection('days').doc(dateStr);
        batch.set(ref, JSON.parse(raw));
      }
    });
    await batch.commit();
    showSyncStatus('synced', 'Sincronizado');
  } catch (e) {
    console.error('Upload all error:', e);
    showSyncStatus('error', 'Erro ao enviar');
  }
}

// Full sync: download then upload
async function fullSync() {
  const changed = await downloadFromFirestore();
  await uploadAllToFirestore();
  return changed;
}

// Save and sync a specific day
async function saveAndSync(dateStr) {
  try {
    await uploadDayToFirestore(dateStr);
    showSyncStatus('synced', 'Salvo na nuvem');
  } catch (e) {
    showSyncStatus('error', 'Erro - salvo local');
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
