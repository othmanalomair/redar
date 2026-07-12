const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

let window;
let overlayWindow;
let tray;
let pollTimer;
let isQuitting = false;
let alertedInGame = new Set();
let leagueOnline = false;
let gameActive = false;
let lastLiveAt = 0;
let overlayTimer;

const GAME_GAP_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;
const WINDOWS_APP_ID = 'com.most3mr.zabalradar';

if (process.platform === 'win32') app.setAppUserModelId(WINDOWS_APP_ID);

const defaultData = {
  players: [],
  settings: { monitoring: true, sound: true, overlay: true, launchAtLogin: false }
};

function dataPath() {
  return path.join(app.getPath('userData'), 'radar-data.json');
}

function readData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath(), 'utf8'));
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      settings: { ...defaultData.settings, ...(parsed.settings || {}) }
    };
  } catch {
    return structuredClone(defaultData);
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataPath()), { recursive: true });
  fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2));
}

function normalizeRiotId(value) {
  return value.trim().replace(/\s*#\s*/, '#').toLocaleLowerCase('en-US');
}

function trayIcon(color = '#7B8494') {
  if (process.platform === 'win32') {
    return nativeImage
      .createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
      .resize({ width: 16, height: 16, quality: 'best' });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="none" stroke="${color}" stroke-width="2"/><circle cx="11" cy="11" r="3" fill="${color}"/><path d="M11 1v3M11 18v3M1 11h3M18 11h3" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  image.setTemplateImage(process.platform === 'darwin');
  return image;
}

function showWindow() {
  if (!window) return;
  if (process.platform === 'darwin') app.dock.show();
  window.show();
  window.focus();
}

function updateTray(status = leagueOnline ? 'watching' : 'idle') {
  if (!tray) return;
  const colors = { idle: '#7B8494', watching: '#39B983', alert: '#F04452', paused: '#D49A38' };
  tray.setImage(trayIcon(colors[status]));
  // A short title keeps the background app unmistakably visible in macOS's
  // menu bar, even when a dense row of template icons makes the mark subtle.
  if (process.platform === 'darwin') {
    tray.setTitle(status === 'alert' ? ' انتبه' : ' رادار');
  }
  tray.setToolTip(status === 'alert' ? 'تم اكتشاف لاعب من القائمة' : 'رادار الزبايل');
  const data = readData();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح رادار الزبايل', click: showWindow },
    { type: 'separator' },
    {
      label: data.settings.monitoring ? 'إيقاف المراقبة مؤقتًا' : 'تشغيل المراقبة',
      click: () => {
        const next = readData();
        next.settings.monitoring = !next.settings.monitoring;
        writeData(next);
        updateTray(next.settings.monitoring ? (leagueOnline ? 'watching' : 'idle') : 'paused');
        window?.webContents.send('data-changed', next);
      }
    },
    { label: 'إضافة لاعب', click: () => { showWindow(); window.webContents.send('focus-add'); } },
    { type: 'separator' },
    { label: 'خروج نهائي', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function createWindow() {
  window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 780,
    minHeight: 620,
    backgroundColor: '#F2F0EA',
    title: 'رادار الزبايل',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
      if (process.platform === 'darwin') app.dock.hide();
    }
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 620,
    height: 190,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
}

function showOverlay(matches, sound = false) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const display = require('electron').screen.getPrimaryDisplay();
  const width = 620;
  const height = Math.min(465, 145 + Math.min(matches.length, 5) * 62);
  overlayWindow.setBounds({
    x: Math.round(display.bounds.x + (display.bounds.width - width) / 2),
    y: Math.round(display.bounds.y + 44),
    width,
    height
  });
  const reveal = () => {
    overlayWindow.webContents.send('show-alert', { matches });
    overlayWindow.showInactive();
    if (sound) shell.beep();
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => overlayWindow?.hide(), 10_200);
  };
  if (overlayWindow.webContents.isLoadingMainFrame()) {
    overlayWindow.webContents.once('did-finish-load', reveal);
  } else {
    reveal();
  }
}

function fetchLivePlayers() {
  return new Promise((resolve, reject) => {
    const request = https.get({
      hostname: '127.0.0.1', port: 2999,
      path: '/liveclientdata/playerlist',
      rejectUnauthorized: false,
      timeout: 2200
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

async function pollLeague() {
  const data = readData();
  if (!data.settings.monitoring) {
    leagueOnline = false;
    window?.webContents.send('league-status', { online: false, paused: true });
    updateTray('paused');
    return;
  }
  try {
    const livePlayers = await fetchLivePlayers();
    const now = Date.now();
    const startsNewGame = !gameActive || (lastLiveAt > 0 && now - lastLiveAt > GAME_GAP_MS);
    if (startsNewGame) alertedInGame = new Set();
    gameActive = true;
    lastLiveAt = now;
    leagueOnline = true;
    const active = livePlayers.find(player => player.isActivePlayer) || livePlayers[0];
    const matches = [];
    const newMatches = [];
    for (const listed of data.players) {
      const found = livePlayers.find(live => normalizeRiotId(live.riotId || live.summonerName || '') === normalizeRiotId(listed.riotId));
      if (!found) continue;
      const side = active && found.team === active.team ? 'معك' : 'ضدك';
      matches.push({ ...listed, side, champion: found.championName || '' });
      if (!alertedInGame.has(listed.id)) {
        alertedInGame.add(listed.id);
        newMatches.push({ ...listed, side, champion: found.championName || '' });
      }
    }
    if (newMatches.length) {
      if (data.settings.overlay) showOverlay(newMatches, data.settings.sound);
      updateTray('alert');
    }
    window?.webContents.send('league-status', { online: true, paused: false, count: livePlayers.length, matches });
    if (!matches.length) updateTray('watching');
  } catch {
    if (lastLiveAt > 0 && Date.now() - lastLiveAt > GAME_GAP_MS) {
      gameActive = false;
    }
    leagueOnline = false;
    window?.webContents.send('league-status', { online: false, paused: false });
    updateTray('idle');
  }
}

app.whenReady().then(() => {
  createWindow();
  createOverlayWindow();
  tray = new Tray(trayIcon());
  tray.on('click', showWindow);
  updateTray();
  pollLeague();
  pollTimer = setInterval(pollLeague, POLL_INTERVAL_MS);
  if (process.argv.includes('--preview-overlay')) {
    setTimeout(() => showOverlay([
      { riotId: 'TrashKing#404', side: 'ضدك', champion: 'Teemo', note: 'سبك وقال jungle diff' },
      { riotId: 'NoHands#MID', side: 'معك', champion: 'Yasuo', note: 'خرب عليك البرومو' },
      { riotId: 'TiltMaster#GG', side: 'ضدك', champion: 'Shaco', note: 'عدو تاريخي' }
    ]), 900);
  }
});

app.on('before-quit', () => { isQuitting = true; clearInterval(pollTimer); });
// Keep the process alive in the menu bar/tray when the window is hidden.
app.on('window-all-closed', () => {});
app.on('activate', showWindow);

ipcMain.handle('get-data', () => readData());
ipcMain.handle('save-player', (_event, player) => {
  const data = readData();
  const riotId = player.riotId.trim().replace(/\s*#\s*/, '#');
  if (!riotId.includes('#')) throw new Error('اكتب Riot ID كامل، مثل Player#TAG');
  const duplicate = data.players.some(item => normalizeRiotId(item.riotId) === normalizeRiotId(riotId) && item.id !== player.id);
  if (duplicate) throw new Error('هذا اللاعب موجود بالقائمة أصلًا');
  const saved = {
    id: player.id || crypto.randomUUID(),
    riotId,
    note: String(player.note || '').trim(),
    level: ['عادي', 'محترف', 'تاريخي'].includes(player.level) ? player.level : 'عادي',
    createdAt: player.createdAt || new Date().toISOString()
  };
  const index = data.players.findIndex(item => item.id === saved.id);
  if (index >= 0) data.players[index] = saved; else data.players.unshift(saved);
  writeData(data);
  updateTray();
  return data;
});
ipcMain.handle('delete-player', (_event, id) => {
  const data = readData();
  data.players = data.players.filter(player => player.id !== id);
  writeData(data);
  return data;
});
ipcMain.handle('save-settings', (_event, settings) => {
  const data = readData();
  data.settings = { ...data.settings, ...settings };
  app.setLoginItemSettings({ openAtLogin: Boolean(data.settings.launchAtLogin), openAsHidden: true });
  writeData(data);
  updateTray(data.settings.monitoring ? (leagueOnline ? 'watching' : 'idle') : 'paused');
  return data;
});
ipcMain.handle('open-riot-docs', () => shell.openExternal('https://developer.riotgames.com/docs/lol'));
ipcMain.handle('test-alert', () => {
  showOverlay([
    { riotId: 'TrashKing#404', side: 'ضدك', champion: 'Teemo', note: 'هذا مثال لشكل التنبيه داخل القيم' },
    { riotId: 'NoHands#MID', side: 'معك', champion: 'Yasuo', note: 'مثال إذا فيه أكثر من هدف' }
  ]);
});
