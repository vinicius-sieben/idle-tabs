const { app, BrowserWindow, ipcMain, session, shell, Menu, MenuItem, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const PANEL_COUNT = 4;

function userDataPath(...segments) {
  return path.join(app.getPath('userData'), ...segments);
}
const CONFIG_PATH = userDataPath('config.json');
const SCRIPTS_DIR = userDataPath('scripts');

function defaultConfig() {
  return {
    allowScripts: false,
    layoutPreset: '2x2',
    openLinksInNewWindow: false,
    extensionEnabled: false,
    extensionPath: '',
    panels: Array.from({ length: PANEL_COUNT }, (_, i) => ({
      id: i,
      name: `Conta ${i + 1}`,
      url: ''
    }))
  };
}

async function readConfig() {
  try {
    const raw = await fsp.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid config');

    if (typeof parsed.allowScripts !== 'boolean') parsed.allowScripts = false;

    const allowedLayouts = ['2x2', '1x4', '4x1'];
    if (!allowedLayouts.includes(parsed.layoutPreset)) parsed.layoutPreset = '2x2';

    if (typeof parsed.openLinksInNewWindow !== 'boolean') parsed.openLinksInNewWindow = false;

    if (typeof parsed.extensionEnabled !== 'boolean') parsed.extensionEnabled = false;
    if (typeof parsed.extensionPath !== 'string') parsed.extensionPath = '';

    if (!Array.isArray(parsed.panels) || parsed.panels.length !== PANEL_COUNT) {
      parsed.panels = defaultConfig().panels;
    } else {
      parsed.panels = parsed.panels.map((p, i) => ({
        id: i,
        name: typeof p?.name === 'string' ? p.name : `Conta ${i + 1}`,
        url: typeof p?.url === 'string' ? p.url : ''
      }));
    }
    return parsed;
  } catch (e) {
    const cfg = defaultConfig();
    await writeConfig(cfg);
    return cfg;
  }
}

async function writeConfig(cfg) {
  await fsp.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fsp.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

async function ensureScriptsDir() {
  await fsp.mkdir(SCRIPTS_DIR, { recursive: true });
  const examplePath = path.join(SCRIPTS_DIR, 'exemplo.js');
  try {
    await fsp.access(examplePath);
  } catch {
    await fsp.writeFile(
      examplePath,
      [
        '// Exemplo de script de automacao para um painel.',
        '// Copie/renomeie para global.js ou panel-0.js .. panel-3.js para ativar',
        '// (com "Permitir scripts de automacao" ligado).',
        '// Executa no contexto da pagina do painel (DOM disponivel).',
        '',
        '(function () {',
        '  console.log("[idle-tabs] script carregado em", location.href);',
        '  // Exemplo (descomente para usar):',
        '  // setInterval(() => {',
        '  //   const btn = document.querySelector("button.claim");',
        '  //   if (btn) btn.click();',
        '  // }, 60000);',
        '})();',
        ''
      ].join('\n'),
      'utf8'
    );
  }
}

async function injectScripts(contents, panelIndex, allowScripts) {
  if (!allowScripts) return;
  for (const name of ['global.js', `panel-${panelIndex}.js`]) {
    const filePath = path.join(SCRIPTS_DIR, name);
    try {
      const code = await fsp.readFile(filePath, 'utf8');
      if (code.trim()) {
        await contents.executeJavaScript(code, true);
      }
    } catch (e) {
      // arquivo opcional
    }
  }
}

let mainWindow = null;
let currentConfig = null;

const childWindows = new Set();

function openChildWindow(url, panelIndex) {
  const idx =
    Number.isInteger(panelIndex) && panelIndex >= 0 && panelIndex < PANEL_COUNT
      ? panelIndex
      : 0;
  const ses = session.fromPartition(`persist:panel${idx}`);
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    title: 'Idle Tabs - Janela adicional',
    backgroundColor: '#0f0f13',
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  childWindows.add(win);
  win.on('closed', () => childWindows.delete(win));
  if (/^https?:\/\//i.test(url)) win.loadURL(url).catch(() => {});
  else win.loadURL('about:blank').catch(() => {});

  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:\/\//i.test(u)) {
      if (currentConfig && currentConfig.openLinksInNewWindow) {
        openChildWindow(u, idx);
      } else {
        shell.openExternal(u);
      }
    }
    return { action: 'deny' };
  });

  return win;
}

const sessionToPanel = new Map();
const panelWebContents = new Map();


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: false
    }
  });
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.backgroundThrottling = false;
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const CHROME_EXT_ID = 'mhnplloljgchpfpcpbhmcokmnefodjnh';

let loadedExtensionId = null;
let loadedExtensionPath = null;

function validateExtensionDir(dir) {
  if (!dir || typeof dir !== 'string') return { ok: false, reason: 'Pasta inválida.' };
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { ok: false, reason: 'manifest.json não encontrado.' };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object') return { ok: false, reason: 'manifest inválido.' };
    return { ok: true, manifest };
  } catch (e) {
    return { ok: false, reason: 'manifest.json ilegível.' };
  }
}

function browserExtensionRoots() {
  const local = process.env.LOCALAPPDATA || '';
  const roaming = process.env.APPDATA || '';
  return [
    path.join(local, 'Google', 'Chrome', 'User Data'),
    path.join(local, 'Chromium', 'User Data'),
    path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    path.join(local, 'Microsoft', 'Edge', 'User Data'),
    path.join(local, 'Vivaldi', 'User Data'),
    path.join(roaming, 'Opera Software', 'Opera Stable'),
    path.join(roaming, 'Opera Software', 'Opera GX Stable')
  ];
}

function findBrowserExtensionDir() {
  try {
    for (const root of browserExtensionRoots()) {
      if (!fs.existsSync(root)) continue;
      let profiles = [];
      try {
        profiles = fs.readdirSync(root, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
      } catch (e) {}
      if (!profiles.length) profiles = [''];
      for (const profile of profiles) {
        const base = path.join(root, profile, 'Extensions', CHROME_EXT_ID);
        if (!fs.existsSync(base)) continue;
        let versions = [];
        try {
          versions = fs.readdirSync(base, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse();
        } catch (e) {}
        for (const v of versions) {
          const dir = path.join(base, v);
          if (validateExtensionDir(dir).ok) return dir;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function removeLoadedExtensions() {
  if (!loadedExtensionId) return;
  for (let i = 0; i < PANEL_COUNT; i++) {
    try { session.fromPartition(`persist:panel${i}`).removeExtension(loadedExtensionId); } catch (e) {}
  }
  loadedExtensionId = null;
  loadedExtensionPath = null;
}

async function applyExtensionState() {
  if (!currentConfig) currentConfig = await readConfig();
  const enabled = !!currentConfig.extensionEnabled;
  const extPath = typeof currentConfig.extensionPath === 'string' ? currentConfig.extensionPath : '';

  if (!enabled || !extPath) {
    removeLoadedExtensions();
    return { ok: true, enabled: false, path: extPath, loaded: false };
  }

  const valid = validateExtensionDir(extPath);
  if (!valid.ok) {
    removeLoadedExtensions();
    return { ok: false, enabled, path: extPath, loaded: !!loadedExtensionId, error: valid.reason };
  }

  if (loadedExtensionId && loadedExtensionPath === extPath) {
    return { ok: true, enabled, path: extPath, loaded: true };
  }

  removeLoadedExtensions();
  try {
    const ext = await session.fromPartition('persist:panel0').loadExtension(extPath);
    loadedExtensionId = ext && ext.id ? ext.id : null;
    loadedExtensionPath = extPath;
    if (loadedExtensionId) {
      for (let i = 1; i < PANEL_COUNT; i++) {
        try { await session.fromPartition(`persist:panel${i}`).loadExtension(extPath); } catch (e) {}
      }
      return { ok: true, enabled, path: extPath, loaded: true, id: loadedExtensionId };
    }
    return { ok: false, enabled, path: extPath, loaded: false, error: 'Falha ao carregar extensão.' };
  } catch (e) {
    removeLoadedExtensions();
    return { ok: false, enabled, path: extPath, loaded: false, error: e && e.message ? e.message : String(e) };
  }
}

app.whenReady().then(async () => {
  for (let i = 0; i < PANEL_COUNT; i++) {
    sessionToPanel.set(session.fromPartition(`persist:panel${i}`), i);
  }
  currentConfig = await readConfig();
  await ensureScriptsDir();
  await applyExtensionState();
  createWindow();

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') {
      // janela principal: abre links externos no navegador padrao
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
      return;
    }

    const panelIndex = sessionToPanel.get(contents.session);
    if (panelIndex === undefined) return;

    panelWebContents.set(panelIndex, contents);
    contents.on('destroyed', () => panelWebContents.delete(panelIndex));

    contents.on('context-menu', (_event, params) => {
      const menu = new Menu();
      if (params && params.linkURL) {
        menu.append(new MenuItem({
          label: 'Abrir link em nova janela',
          click: () => openChildWindow(params.linkURL, panelIndex)
        }));
        menu.append(new MenuItem({
          label: 'Copiar link',
          click: () => clipboard.writeText(params.linkURL)
        }));
      }
      menu.append(new MenuItem({
        label: 'Abrir esta página em nova janela',
        click: () => openChildWindow(contents.getURL(), panelIndex)
      }));
      menu.append(new MenuItem({
        label: 'Recarregar',
        click: () => { try { contents.reload(); } catch (e) {} }
      }));
      menu.popup({ window: (BrowserWindow.fromWebContents(contents) || mainWindow) });
    });

    contents.on('did-finish-load', async () => {
      if (!currentConfig) currentConfig = await readConfig();
      await injectScripts(contents, panelIndex, currentConfig.allowScripts);
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        openChildWindow(url, panelIndex);
      }
      return { action: 'deny' };
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC ----
ipcMain.handle('config:get', async () => {
  if (!currentConfig) currentConfig = await readConfig();
  return currentConfig;
});

ipcMain.handle('config:set', async (_event, cfg) => {
  const safe = {
    allowScripts: !!cfg?.allowScripts,
    layoutPreset: ['2x2', '1x4', '4x1'].includes(cfg?.layoutPreset) ? cfg.layoutPreset : '2x2',
    openLinksInNewWindow: !!cfg?.openLinksInNewWindow,
    extensionEnabled: !!cfg?.extensionEnabled,
    extensionPath: typeof cfg?.extensionPath === 'string' ? cfg.extensionPath : '',
    panels: defaultConfig().panels.map((_, i) => {
      const p = Array.isArray(cfg?.panels) ? cfg.panels[i] : null;
      return {
        id: i,
        name: typeof p?.name === 'string' ? p.name : `Conta ${i + 1}`,
        url: typeof p?.url === 'string' ? p.url : ''
      };
    })
  };
  currentConfig = safe;
  await writeConfig(safe);
  return true;
});

ipcMain.handle('session:clear', async (_event, panelIndex) => {
  const idx = Number(panelIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= PANEL_COUNT) return false;
  const ses = session.fromPartition(`persist:panel${idx}`);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

ipcMain.handle('scripts:setAllow', async (_event, value) => {
  if (!currentConfig) currentConfig = await readConfig();
  currentConfig.allowScripts = !!value;
  await writeConfig(currentConfig);
  return currentConfig.allowScripts;
});

ipcMain.handle('links:setOpenInNewWindow', async (_event, value) => {
  if (!currentConfig) currentConfig = await readConfig();
  currentConfig.openLinksInNewWindow = !!value;
  await writeConfig(currentConfig);
  return currentConfig.openLinksInNewWindow;
});

ipcMain.handle('windows:openCurrent', async (_event, panelIndex) => {
  const idx = Number(panelIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= PANEL_COUNT) return false;
  const wc = panelWebContents.get(idx);
  if (!wc || wc.isDestroyed()) return false;
  const url = wc.getURL();
  if (!/^https?:\/\//i.test(url) || url === 'about:blank') return false;
  openChildWindow(url, idx);
  return true;
});

ipcMain.handle('extensions:status', async () => {
  if (!currentConfig) currentConfig = await readConfig();
  const status = await applyExtensionState();
  return {
    enabled: !!currentConfig.extensionEnabled,
    path: currentConfig.extensionPath || '',
    loaded: !!status.loaded,
    loadedId: loadedExtensionId,
    chromePath: findBrowserExtensionDir(),
    error: status.error || null
  };
});

ipcMain.handle('extensions:setEnabled', async (_event, value) => {
  if (!currentConfig) currentConfig = await readConfig();
  currentConfig.extensionEnabled = !!value;
  await writeConfig(currentConfig);
  const status = await applyExtensionState();
  return {
    enabled: !!currentConfig.extensionEnabled,
    path: currentConfig.extensionPath || '',
    loaded: !!status.loaded,
    error: status.error || null
  };
});

ipcMain.handle('extensions:importChrome', async () => {
  if (!currentConfig) currentConfig = await readConfig();
  const src = findBrowserExtensionDir();
  if (!src) {
    return { ok: false, error: 'Extensão /hunt não encontrada no Chrome.' };
  }
  const dest = userDataPath('extensions', 'pokeidle');
  try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) {}
  try { fs.mkdirSync(path.dirname(dest), { recursive: true }); } catch (e) {}
  try { fs.cpSync(src, dest, { recursive: true, force: true }); } catch (e) {
    return { ok: false, error: 'Falha ao copiar extensão do Chrome.' };
  }
  currentConfig.extensionPath = dest;
  currentConfig.extensionEnabled = true;
  await writeConfig(currentConfig);
  const status = await applyExtensionState();
  return { ok: true, path: dest, loaded: !!status.loaded, error: status.error || null };
});

ipcMain.handle('extensions:selectFolder', async () => {
  if (!currentConfig) currentConfig = await readConfig();
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, error: 'Cancelado.' };
  const selected = result.filePaths[0];
  const valid = validateExtensionDir(selected);
  if (!valid.ok) return { ok: false, error: valid.reason };
  currentConfig.extensionPath = selected;
  currentConfig.extensionEnabled = true;
  await writeConfig(currentConfig);
  const status = await applyExtensionState();
  return { ok: true, path: selected, loaded: !!status.loaded, error: status.error || null };
});

ipcMain.handle('automation:execute', async (_event, panelIndex, code) => {
  if (!currentConfig) currentConfig = await readConfig();
  if (!currentConfig.allowScripts) {
    return { ok: false, error: 'Automacao desativada. Ative "Permitir scripts de automacao".' };
  }
  const idx = Number(panelIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= PANEL_COUNT) {
    return { ok: false, error: 'Painel invalido.' };
  }
  if (typeof code !== 'string' || !code.trim()) {
    return { ok: false, error: 'Codigo vazio.' };
  }
  const wc = panelWebContents.get(idx);
  if (!wc || wc.isDestroyed()) {
    return { ok: false, error: 'Painel nao carregado.' };
  }
  try {
    const result = await wc.executeJavaScript(String(code), true);
    return { ok: true, result: result === undefined ? null : result };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});
