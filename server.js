const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 Minuten

let lastHeartbeat = null;
let lastStatus = null;
let timeoutTimer = null;
let lastUsername = '';

function sendDiscordWebhook(loggedIn, username) {
    if (!WEBHOOK_URL) {
        console.error('[Server] Kein DISCORD_WEBHOOK_URL gesetzt!');
        return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Europe/Berlin'
    });

    const embed = loggedIn
        ? {
            title: `🟢  ${username ? username + ' ist eingeloggt!' : 'Jemand ist eingeloggt!'}`,
            description: `**${timeStr} Uhr**`,
            color: 0x2ECC71,
            timestamp: now.toISOString(),
        }
        : {
            title: `🔴  ${username ? username + ' hat ausgeloggt' : 'Niemand eingeloggt'}`,
            description: `**${timeStr} Uhr**`,
            color: 0xE74C3C,
            timestamp: now.toISOString(),
        };

    const payload = JSON.stringify({
        username: '🏰 Stämme Monitor',
        embeds: [embed],
    });

    const url = new URL(WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
    };

    const req = https.request(options, (res) => {
        console.log(`[Server] Discord Webhook gesendet: ${loggedIn ? 'LOGIN' : 'LOGOUT'} (${res.statusCode})`);
    });
    req.on('error', (e) => console.error('[Server] Webhook Fehler:', e.message));
    req.write(payload);
    req.end();
}

function startTimeoutTimer() {
    clearTimeout(timeoutTimer);
    timeoutTimer = setTimeout(() => {
        console.log('[Server] Timeout! Kein Heartbeat seit', TIMEOUT_MS / 1000, 'Sekunden');
        if (lastStatus !== 'offline') {
            lastStatus = 'offline';
            sendDiscordWebhook(false, lastUsername);
        }
    }, TIMEOUT_MS);
}

// MIME Types für statische Dateien
const MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ── Statische Dateien aus /public ──────────────────────
    if (req.method === 'GET' && (req.url.startsWith('/sw') || req.url === '/monitor.html')) {
        const filePath = path.join(__dirname, 'public', req.url);
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'text/plain';

        // Service Worker braucht speziellen Header
        if (req.url.includes('sw.js')) {
            res.setHeader('Service-Worker-Allowed', '/');
            res.setHeader('Cache-Control', 'no-cache');
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
        return;
    }

    // ── Status-Endpunkt ────────────────────────────────────
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'running',
            lastHeartbeat,
            currentStatus: lastStatus,
            lastUsername,
        }));
        return;
    }

    // ── Heartbeat-Endpunkt ─────────────────────────────────
    if (req.method === 'POST' && req.url === '/heartbeat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            let username = '';
            try {
                const data = JSON.parse(body);
                username = data.username || '';
            } catch (_) {}

            lastHeartbeat = new Date().toISOString();
            lastUsername = username;

            if (lastStatus !== 'online') {
                console.log('[Server] Login erkannt:', username || 'Unbekannt');
                lastStatus = 'online';
                sendDiscordWebhook(true, username);
            }

            startTimeoutTimer();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] 🏰 Stämme Monitor Server läuft auf Port ${PORT}`);
    console.log(`[Server] Timeout: ${TIMEOUT_MS / 1000}s`);
    if (!WEBHOOK_URL) console.warn('[Server] ⚠️  DISCORD_WEBHOOK_URL nicht gesetzt!');
});
