const HEARTBEAT_INTERVAL_MS = 25_000;
const SERVER_URL = 'https://staemme-monitor.onrender.com';

let heartbeatInterval = null;
let username = '';
let isLoggedIn = false;

self.addEventListener('install', () => {
    console.log('[SW] Service Worker installiert');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker aktiviert');
    event.waitUntil(self.clients.claim());
});

// Nachrichten vom Tab empfangen
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    if (type === 'START_HEARTBEAT') {
        username = payload.username || '';
        isLoggedIn = true;
        console.log('[SW] Heartbeat gestartet für:', username);
        startHeartbeat();
    }

    if (type === 'STOP_HEARTBEAT') {
        isLoggedIn = false;
        stopHeartbeat();
        console.log('[SW] Heartbeat gestoppt');
    }

    if (type === 'UPDATE_USERNAME') {
        username = payload.username || '';
    }
});

function startHeartbeat() {
    stopHeartbeat(); // Doppelte Intervalle verhindern
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function sendHeartbeat() {
    if (!isLoggedIn) return;

    fetch(SERVER_URL + '/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
    })
    .then(res => console.log('[SW] 💓 Heartbeat gesendet. Status:', res.status))
    .catch(err => console.error('[SW] ❌ Heartbeat Fehler:', err));
}
