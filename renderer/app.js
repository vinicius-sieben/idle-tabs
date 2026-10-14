const PANEL_COUNT = 4;

const panels = [];
let saveTimer = null;

let layoutPreset = '2x2';
let displayMode = 'all'; // 'all' | 'two' | 'one' | 'custom'
let focusedPanel = 0;
const hiddenSet = new Set();
let maximizedPanel = null;

function $(id) {
  return document.getElementById(id);
}

function normalizeUrl(input) {
  const v = (input || '').trim();
  if (!v) return null;
  let value = v;
  if (!/^[a-z]+:\/\//i.test(value)) value = 'https://' + value;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAll, 400);
}

function saveAll() {
  const cfg = {
    allowScripts: !!$('allow-scripts').checked,
    openLinksInNewWindow: !!$('open-links-new-window').checked,
    layoutPreset: layoutPreset,
    panels: panels.map((p, i) => ({
      id: i,
      name: (p.nameInput.value || '').trim() || `Conta ${i + 1}`,
      url: (p.urlInput.value || '').trim()
    }))
  };
  window.api.saveConfig(cfg).catch(() => {});
}

function setStatus(i, text) {
  if (panels[i] && panels[i].status) panels[i].status.textContent = text || '';
}

function getGrid() {
  return document.querySelector('.grid');
}

function applyLayout() {
  const grid = getGrid();
  if (!grid) return;
  grid.classList.remove('layout-2x2', 'layout-1x4', 'layout-4x1');
  grid.classList.add(`layout-${layoutPreset}`);
}

function applyVisibility() {
  panels.forEach((p, i) => {
    p.panelEl.classList.remove('is-hidden', 'is-maximized', 'is-focused');
  });

  if (maximizedPanel !== null) {
    panels.forEach((p, i) => {
      if (i !== maximizedPanel) p.panelEl.classList.add('is-hidden');
    });
    panels[maximizedPanel].panelEl.classList.add('is-maximized');
  } else {
    hiddenSet.forEach((i) => {
      if (panels[i]) panels[i].panelEl.classList.add('is-hidden');
    });
    if (displayMode === 'two') {
      if (panels[2]) panels[2].panelEl.classList.add('is-hidden');
      if (panels[3]) panels[3].panelEl.classList.add('is-hidden');
    }
    if (displayMode === 'one') {
      panels.forEach((p, i) => {
        if (i !== focusedPanel) p.panelEl.classList.add('is-hidden');
      });
    }
  }

  if (panels[focusedPanel] && panels[focusedPanel].panelEl) {
    panels[focusedPanel].panelEl.classList.add('is-focused');
  }
}

function attachWebview(i) {
  const wv = panels[i].webview;

  wv.addEventListener('did-start-loading', () => {
    setStatus(i, 'Carregando...');
  });

  wv.addEventListener('did-stop-loading', () => {
    if (panels[i].status.textContent === 'Carregando...') {
      setStatus(i, '');
    }
  });

  wv.addEventListener('did-navigate', (e) => {
    if (e && e.url && e.url !== 'about:blank') {
      const input = panels[i].urlInput;
      if (document.activeElement !== input) {
        input.value = e.url;
      }
    }
    if (panels[i].status.textContent === 'Carregando...') {
      setStatus(i, '');
    }
  });

  wv.addEventListener('did-fail-load', (e) => {
    if (e && e.isMainFrame) {
      setStatus(i, `Falha ao carregar: ${e.errorDescription || e.errorCode || 'erro desconhecido'}`);
    }
  });
}

function loadPanel(i) {
  const p = panels[i];
  const raw = (p.urlInput.value || '').trim();

  if (!raw) {
    try { p.webview.loadURL('about:blank'); } catch (e) {}
    setStatus(i, '');
    return;
  }

  const norm = normalizeUrl(raw);
  if (!norm) {
    setStatus(i, 'URL inválida. Cole um link http/https.');
    return;
  }

  setStatus(i, 'Carregando...');
  try {
    p.webview.loadURL(norm);
  } catch (e) {
    setStatus(i, `Erro: ${e && e.message ? e.message : e}`);
  }
}

function setupPanel(i) {
  const p = panels[i];

  p.nameInput.addEventListener('input', scheduleSave);
  p.urlInput.addEventListener('input', scheduleSave);

  p.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadPanel(i);
      scheduleSave();
    }
  });

  p.reloadBtn.addEventListener('click', () => {
    loadPanel(i);
    scheduleSave();
  });

  p.clearBtn.addEventListener('click', async () => {
    if (!window.confirm('Limpar cookies e dados salvos desta conta?')) return;
    try { await window.api.clearSession(i); } catch (e) {}
    try { p.webview.loadURL('about:blank'); } catch (e) {}
    setStatus(i, 'Sessão limpa.');
    scheduleSave();
  });

  const newWindowBtn = p.newWindowBtn;
  if (newWindowBtn) {
    newWindowBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await window.api.openCurrentWindow(i).catch(() => false);
      setStatus(i, ok ? 'Abrindo em nova janela...' : 'Nenhuma página carregada.');
      setTimeout(() => {
        if (panels[i].status.textContent === 'Abrindo em nova janela...') setStatus(i, '');
      }, 2000);
    });
  }

  const maximizeBtn = $(`maximize-${i}`);
  const hideBtn = $(`hide-${i}`);
  p.maximizeBtn = maximizeBtn;
  p.hideBtn = hideBtn;

  maximizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    maximizedPanel = i;
    focusedPanel = i;
    displayMode = 'one';
    const sel = $('visible-count');
    if (sel) sel.value = '1';
    applyVisibility();
    scheduleSave();
  });

  hideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hiddenSet.size >= 3) {
      setStatus(i, 'Mantenha pelo menos um painel visível.');
      return;
    }
    hiddenSet.add(i);
    displayMode = 'custom';
    applyVisibility();
    scheduleSave();
  });

  p.panelEl.addEventListener('click', () => {
    focusedPanel = i;
    panels.forEach((pp) => pp.panelEl.classList.remove('is-focused'));
    p.panelEl.classList.add('is-focused');
    if (displayMode === 'one') {
      applyVisibility();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  for (let i = 0; i < PANEL_COUNT; i++) {
    panels.push({
      nameInput: $(`name-${i}`),
      urlInput: $(`url-${i}`),
      reloadBtn: $(`reload-${i}`),
      clearBtn: $(`clear-${i}`),
      status: $(`status-${i}`),
      webview: $(`webview-${i}`),
      panelEl: document.querySelector(`.panel[data-index="${i}"]`),
      maximizeBtn: null,
      hideBtn: null,
      newWindowBtn: $(`new-window-${i}`)
    });
  }

  for (let i = 0; i < PANEL_COUNT; i++) attachWebview(i);
  for (let i = 0; i < PANEL_COUNT; i++) setupPanel(i);

  const grid = getGrid();
  if (grid) grid.classList.add(`layout-${layoutPreset}`);

  const layoutSelect = $('layout-select');
  if (layoutSelect) {
    layoutSelect.value = layoutPreset;
    layoutSelect.addEventListener('change', () => {
      layoutPreset = layoutSelect.value;
      applyLayout();
      scheduleSave();
    });
  }

  const visibleSelect = $('visible-count');
  if (visibleSelect) {
    visibleSelect.addEventListener('change', () => {
      const v = visibleSelect.value;
      maximizedPanel = null;
      hiddenSet.clear();
      if (v === '4') displayMode = 'all';
      else if (v === '2') displayMode = 'two';
      else if (v === '1') displayMode = 'one';
      applyVisibility();
      scheduleSave();
    });
  }

  const restoreBtn = $('restore-grid');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      maximizedPanel = null;
      hiddenSet.clear();
      displayMode = 'all';
      if (visibleSelect) visibleSelect.value = '4';
      applyVisibility();
      scheduleSave();
    });
  }

  // Carrega config
  let cfg = null;
  try {
    cfg = await window.api.getConfig();
  } catch (e) {
    cfg = { allowScripts: false, openLinksInNewWindow: false, layoutPreset: '2x2', panels: [] };
  }

  const toggle = $('allow-scripts');
  if (toggle) {
    toggle.checked = !!(cfg && cfg.allowScripts);
    toggle.addEventListener('change', async () => {
      try { await window.api.setAllowScripts(toggle.checked); } catch (e) {}
      scheduleSave();
    });
  }

  const linksToggle = $('open-links-new-window');
  if (linksToggle) {
    linksToggle.checked = !!(cfg && cfg.openLinksInNewWindow);
    linksToggle.addEventListener('change', async () => {
      try { await window.api.setOpenLinksInNewWindow(linksToggle.checked); } catch (e) {}
      scheduleSave();
    });
  }

  if (cfg && (cfg.layoutPreset === '2x2' || cfg.layoutPreset === '1x4' || cfg.layoutPreset === '4x1')) {
    layoutPreset = cfg.layoutPreset;
    if (layoutSelect) layoutSelect.value = layoutPreset;
    applyLayout();
  }

  if (cfg && Array.isArray(cfg.panels)) {
    cfg.panels.forEach((p, i) => {
      if (!panels[i]) return;
      panels[i].nameInput.value = p.name || '';
      panels[i].urlInput.value = p.url || '';
    });
  }

  panels.forEach((_, i) => {
    const url = (cfg && cfg.panels && cfg.panels[i] && cfg.panels[i].url) || '';
    if ((url || '').trim()) loadPanel(i);
  });

  const extEnabled = $('ext-enabled');
  const extStatus = $('ext-status');
  const extImportBtn = $('ext-import-chrome');
  const extSelectBtn = $('ext-select-folder');

  async function refreshExtStatus() {
    try {
      const st = await window.api.getExtensionStatus();
      if (extEnabled) extEnabled.checked = !!st.enabled;
      if (extStatus) {
        if (st.loaded) extStatus.textContent = 'ativa';
        else if (st.error) extStatus.textContent = 'erro';
        else if (st.path) extStatus.textContent = 'desativada';
        else extStatus.textContent = 'não importada';
      }
    } catch (e) {
      if (extStatus) extStatus.textContent = 'erro';
    }
  }

  if (extEnabled) {
    extEnabled.addEventListener('change', async () => {
      await window.api.setExtensionEnabled(extEnabled.checked).catch(() => null);
      await refreshExtStatus();
    });
  }
  if (extImportBtn) {
    extImportBtn.addEventListener('click', async () => {
      if (extStatus) extStatus.textContent = 'importando...';
      const st = await window.api.importExtensionFromChrome().catch(() => null);
      if (!st || !st.ok) {
        if (extStatus) extStatus.textContent = (st && st.error) ? st.error : 'falha';
      } else {
        if (extEnabled) extEnabled.checked = true;
      }
      await refreshExtStatus();
    });
  }
  if (extSelectBtn) {
    extSelectBtn.addEventListener('click', async () => {
      const st = await window.api.selectExtensionFolder().catch(() => null);
      if (!st || !st.ok) {
        if (extStatus) extStatus.textContent = (st && st.error) ? st.error : 'cancelado';
      } else {
        if (extEnabled) extEnabled.checked = true;
      }
      await refreshExtStatus();
    });
  }

  refreshExtStatus();

  applyVisibility();
});
