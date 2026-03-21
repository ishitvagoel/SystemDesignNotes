// ── MERMAID INIT ──
function initMermaid(isLight = false) {
  mermaid.initialize({
    startOnLoad: false,
    theme: isLight ? 'default' : 'dark',
    themeVariables: isLight ? {
      primaryColor: '#ffffff',
      primaryBorderColor: '#2d8a4e',
      primaryTextColor: '#1a1c1a',
      lineColor: '#1e6334',
      secondaryColor: '#f0f0ed',
      tertiaryColor: '#efefec',
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '13px'
    } : {
      primaryColor: '#1c201b',
      primaryBorderColor: '#6bde8c',
      primaryTextColor: '#d4d8d3',
      lineColor: '#4ab86a',
      secondaryColor: '#222622',
      tertiaryColor: '#171a16',
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '13px'
    }
  });
}
initMermaid(localStorage.getItem('theme') === 'light');

// Custom marked renderer for mermaid code blocks
const renderer = new marked.Renderer();
const origCodeRenderer = renderer.code;
renderer.code = function(code, language) {
  // Handle both marked v9 (object arg) and string args
  let text, lang;
  if (typeof code === 'object') {
    text = code.text;
    lang = code.lang;
  } else {
    text = code;
    lang = language;
  }
  if (lang === 'mermaid') {
    // Escape for HTML pre tag
    const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="mermaid-wrapper"><pre class="mermaid">${escaped}</pre></div>`;
  }
  // fallback to default
  const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<pre><code class="language-${lang || ''}">${escaped}</code></pre>`;
};
marked.setOptions({ renderer });

// ── DATA (populated by init()) ──
let VAULT_INDEX = [];
let SEARCH_INDEX = {};
let GRAPH_EDGES = [];
let FILTERED_INDEX = [];
let NOTE_CACHE = {};

// ── STATE ──
let tabs = [];
let activeTabId = null;
let openTabs = {}; // id -> {note, scrollTop}
let searchActive = false;
let outlineActive = false;
let dragState = null;
let ghostEl = null;
let customOrder = {}; // folder -> [id, ...]
let sectionCollapsed = {};

// ── PHASE CONFIG ──
const PHASE_CONFIG = {
  '00-Meta':                          { label: 'Meta', cls: 'phase-0', short: 'M' },
  '01-Phase-1-Foundations':           { label: 'Phase 1 — Foundations', cls: 'phase-1', short: 'P1' },
  '02-Phase-2-Distribution':          { label: 'Phase 2 — Distribution', cls: 'phase-2', short: 'P2' },
  '03-Phase-3-Architecture-Operations': { label: 'Phase 3 — Architecture', cls: 'phase-3', short: 'P3' },
  '04-Phase-4-Modern-AI':             { label: 'Phase 4 — Modern AI', cls: 'phase-4', short: 'P4' },
  '05-Capstones':                     { label: 'Capstones', cls: 'phase-cap', short: 'CAP' },
};

// ── BUILD SIDEBAR ──
function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';

  const grouped = {};
  for (const note of FILTERED_INDEX) {
    if (!grouped[note.folder]) grouped[note.folder] = {};
    const sub = note.subfolder || '_root';
    if (!grouped[note.folder][sub]) grouped[note.folder][sub] = [];
    grouped[note.folder][sub].push(note);
  }

  const folderOrder = Object.keys(PHASE_CONFIG);

  for (const folder of folderOrder) {
    if (!grouped[folder]) continue;
    const cfg = PHASE_CONFIG[folder];
    const isCollapsed = sectionCollapsed[folder] || false;

    const section = document.createElement('div');
    section.className = `sidebar-section ${cfg.cls}${isCollapsed ? ' collapsed' : ''}`;
    section.dataset.folder = folder;

    // section header
    const hdr = document.createElement('div');
    hdr.className = 'sidebar-section-header';
    hdr.innerHTML = `
      <span class="phase-tag">${cfg.short}</span>
      <span class="section-name">${cfg.label}</span>
      <span class="chevron">▾</span>
    `;
    hdr.addEventListener('click', () => toggleSection(folder, section));

    // drag-over for section (to move note into this section)
    hdr.addEventListener('dragover', e => {
      e.preventDefault();
      hdr.classList.add('drop-target');
    });
    hdr.addEventListener('dragleave', () => hdr.classList.remove('drop-target'));
    hdr.addEventListener('drop', e => {
      e.preventDefault();
      hdr.classList.remove('drop-target');
      if (dragState) handleDropOnSection(folder);
    });

    section.appendChild(hdr);

    // gather subfolders
    const subs = Object.keys(grouped[folder]).sort();

    // put _root files first if they exist
    for (const sub of subs) {
      const files = grouped[folder][sub];
      if (sub !== '_root') {
        const modLabel = document.createElement('div');
        modLabel.className = 'sidebar-module-label';
        modLabel.textContent = sub.replace(/^Module-\d+-/, '').replace(/-/g, ' ');
        section.appendChild(modLabel);
      }

      // sort: MOC files first, then alphabetical
      const sorted = [...files].sort((a, b) => {
        if (a.is_moc && !b.is_moc) return -1;
        if (!a.is_moc && b.is_moc) return 1;
        return a.title.localeCompare(b.title);
      });

      for (const note of sorted) {
        const fileEl = document.createElement('div');
        fileEl.className = `sidebar-file${note.is_moc ? ' moc-file' : ''}`;
        fileEl.dataset.id = note.id;
        fileEl.draggable = true;
        fileEl.innerHTML = `
          <span class="file-icon">${note.is_moc ? '◈' : '◻'}</span>
          <span class="file-name">${note.title}</span>
        `;

        if (note.id === activeTabId) fileEl.classList.add('active');

        fileEl.addEventListener('click', () => openNote(note.id));
        fileEl.addEventListener('dragstart', e => onDragStart(e, note, fileEl));
        fileEl.addEventListener('dragend', onDragEnd);
        fileEl.addEventListener('dragover', e => onDragOver(e, fileEl));
        fileEl.addEventListener('dragleave', () => fileEl.classList.remove('drag-over'));
        fileEl.addEventListener('drop', e => onDrop(e, note.id, fileEl));

        section.appendChild(fileEl);
      }
    }

    sidebar.appendChild(section);
  }
}

function toggleSection(folder, sectionEl) {
  sectionCollapsed[folder] = !sectionCollapsed[folder];
  sectionEl.classList.toggle('collapsed', sectionCollapsed[folder]);
}

// ── DRAG & DROP ──
function onDragStart(e, note, el) {
  dragState = { noteId: note.id, note };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', note.id);

  // custom ghost
  ghostEl = document.createElement('div');
  ghostEl.className = 'drag-ghost';
  ghostEl.textContent = note.title;
  document.body.appendChild(ghostEl);
  e.dataTransfer.setDragImage(new Image(), 0, 0);

  el.style.opacity = '0.4';

  document.addEventListener('dragover', moveDragGhost);
}

function moveDragGhost(e) {
  if (ghostEl) {
    ghostEl.style.left = (e.clientX + 12) + 'px';
    ghostEl.style.top = (e.clientY - 10) + 'px';
  }
}

function onDragEnd(e) {
  dragState = null;
  if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  document.removeEventListener('dragover', moveDragGhost);

  // reset opacity
  document.querySelectorAll('.sidebar-file').forEach(el => el.style.opacity = '');
  document.querySelectorAll('.sidebar-file.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.sidebar-section-header.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function onDragOver(e, targetEl) {
  if (!dragState || dragState.noteId === targetEl.dataset.id) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  targetEl.classList.add('drag-over');
}

function onDrop(e, targetId, targetEl) {
  e.preventDefault();
  targetEl.classList.remove('drag-over');
  if (!dragState || dragState.noteId === targetId) return;

  // Get the source and target notes
  const srcNote = VAULT_INDEX.find(n => n.id === dragState.noteId);
  const tgtNote = VAULT_INDEX.find(n => n.id === targetId);

  if (!srcNote || !tgtNote) return;

  // Move srcNote to be positioned before tgtNote in the index
  const srcIdx = VAULT_INDEX.indexOf(srcNote);
  const tgtIdx = VAULT_INDEX.indexOf(tgtNote);

  VAULT_INDEX.splice(srcIdx, 1);
  const newTgt = VAULT_INDEX.indexOf(tgtNote);
  VAULT_INDEX.splice(newTgt, 0, srcNote);

  buildSidebar();
  updateSidebarActive();
}

function handleDropOnSection(targetFolder) {
  if (!dragState) return;
  const srcNote = VAULT_INDEX.find(n => n.id === dragState.noteId);
  if (!srcNote) return;

  // Move to end of target folder
  const idx = VAULT_INDEX.indexOf(srcNote);
  VAULT_INDEX.splice(idx, 1);
  // find last note in targetFolder
  let lastIdx = -1;
  for (let i = 0; i < VAULT_INDEX.length; i++) {
    if (VAULT_INDEX[i].folder === targetFolder) lastIdx = i;
  }
  VAULT_INDEX.splice(lastIdx + 1, 0, srcNote);
  buildSidebar();
  updateSidebarActive();
}

// ── TABS ──
async function openNote(id) {
  const note = FILTERED_INDEX.find(n => n.id === id);
  if (!note) return;

  if (!tabs.includes(id)) {
    tabs.push(id);
    openTabs[id] = { note, scrollTop: 0 };
  }

  activeTabId = id;
  renderTabs();

  // Lazy load content
  if (!NOTE_CACHE[id]) {
    try {
      const res = await fetch(`data/notes/${id}.md`);
      NOTE_CACHE[id] = await res.text();
    } catch (err) {
      console.error('Failed to load note:', err);
      NOTE_CACHE[id] = 'Error loading note content.';
    }
  }

  renderNote(id);
  updateSidebarActive();
  if (outlineActive) buildOutline(id);
}

function closeTab(id, e) {
  e.stopPropagation();
  const idx = tabs.indexOf(id);
  tabs.splice(idx, 1);
  delete openTabs[id];

  if (activeTabId === id) {
    if (tabs.length === 0) {
      activeTabId = null;
      showWelcome();
    } else {
      const newActive = tabs[Math.min(idx, tabs.length - 1)];
      openNote(newActive);
    }
  }

  renderTabs();
  updateSidebarActive();
}

function renderTabs() {
  const bar = document.getElementById('tabs-bar');
  bar.innerHTML = '';

  for (const id of tabs) {
    const note = FILTERED_INDEX.find(n => n.id === id);
    if (!note) continue;

    const tab = document.createElement('div');
    tab.className = `tab${id === activeTabId ? ' active' : ''}`;
    tab.innerHTML = `
      <span class="tab-name">${note.title}</span>
      <span class="tab-close" data-close="${id}">×</span>
    `;
    tab.addEventListener('click', (e) => {
      if (e.target.dataset.close) { closeTab(e.target.dataset.close, e); return; }
      openNote(id);
    });
    bar.appendChild(tab);
  }
}

function updateSidebarActive() {
  document.querySelectorAll('.sidebar-file').forEach(el => {
    el.classList.toggle('active', el.dataset.id === activeTabId);
  });
}

// ── RENDER NOTE ──
function renderNote(id) {
  const note = FILTERED_INDEX.find(n => n.id === id);
  const content = NOTE_CACHE[id] || '';

  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('search-screen').style.display = 'none';
  document.getElementById('note-screen').style.display = 'flex';
  if (outlineActive) {
    document.getElementById('outline-screen').style.display = 'flex';
  }

  // breadcrumb
  const cfg = PHASE_CONFIG[note.folder] || {};
  const sub = note.subfolder ? note.subfolder.replace(/^Module-\d+-/, '').replace(/-/g, ' ') : '';
  document.getElementById('note-breadcrumb').innerHTML = `
    <span>${cfg.label || note.folder}</span>
    ${sub ? `<span>›</span><span>${sub}</span>` : ''}
  `;

  // title
  document.getElementById('note-title').textContent = note.title;

  // meta
  const meta = document.getElementById('note-meta');
  meta.innerHTML = '';
  if (note.status) {
    const t = document.createElement('span');
    t.className = `meta-tag status-${note.status}`;
    t.textContent = note.status;
    meta.appendChild(t);
  }
  if (note.tags) {
    const tags = note.tags.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
    tags.slice(0, 4).forEach(tag => {
      const t = document.createElement('span');
      t.className = 'meta-tag';
      t.textContent = tag;
      meta.appendChild(t);
    });
  }
  if (note.module) {
    const t = document.createElement('span');
    t.className = 'meta-tag';
    t.textContent = `Module ${note.module}`;
    meta.appendChild(t);
  }
  if (note.last_updated) {
    const t = document.createElement('span');
    t.className = 'meta-tag meta-date';
    const d = new Date(note.last_updated + 'T00:00:00');
    t.textContent = `Updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    meta.appendChild(t);
  }

  // body
  const body = document.getElementById('note-body');
  body.innerHTML = marked.parse(content);

  // Add Copy Buttons to code blocks (excluding mermaid blocks)
  body.querySelectorAll('pre:not(.mermaid)').forEach(block => {
    // Only process if it has a code child (standard markdown code blocks)
    const codeEl = block.querySelector('code');
    if (!codeEl) return;

    const btn = document.createElement('button');
    btn.className = 'copy-code-btn';
    btn.innerHTML = 'Copy';
    btn.onclick = () => {
      const code = codeEl.innerText;
      navigator.clipboard.writeText(code);
      btn.innerHTML = 'Copied!';
      setTimeout(() => btn.innerHTML = 'Copy', 2000);
    };
    block.style.position = 'relative';
    block.appendChild(btn);
    // Syntax highlighting
    if (typeof hljs !== 'undefined') {
      hljs.highlightElement(codeEl);
    }
  });

  // Build In-Page TOC
  const tocList = document.getElementById('toc-list');
  const tocContainer = document.getElementById('note-toc');
  const headings = body.querySelectorAll('h2, h3');
  tocList.innerHTML = '';
  
  if (headings.length > 1 && window.innerWidth > 1100) {
    tocContainer.style.display = 'block';
    headings.forEach((h, i) => {
      const id = `heading-${i}`;
      h.id = id;
      const item = document.createElement('div');
      item.className = `toc-item toc-${h.tagName.toLowerCase()}`;
      item.textContent = h.textContent;
      item.onclick = () => h.scrollIntoView({ behavior: 'smooth' });
      tocList.appendChild(item);
    });
  } else {
    tocContainer.style.display = 'none';
  }

  // Render mermaid diagrams
  body.querySelectorAll('.mermaid').forEach((el, i) => {
    let rawText = el.textContent.trim();
    const id = `mermaid-diag-${Math.random().toString(36).substring(2, 11)}-${i}`;
    
    // 1. Fix common syntax errors in memory
    // Change --|Label| to -->|Label|
    rawText = rawText.replace(/ --\|/g, ' -->|');
    
    // 2. Replace CSS variables with actual values because mermaid parser doesn't like var(--...)
    const isLight = document.body.classList.contains('light-mode');
    const themeVars = {
      '--bg': isLight ? '#fdfdfc' : '#0d0f0e',
      '--bg2': isLight ? '#f5f5f3' : '#121512',
      '--bg3': isLight ? '#efefec' : '#171a16',
      '--surface': isLight ? '#ffffff' : '#1c201b',
      '--surface2': isLight ? '#f0f0ed' : '#222622',
      '--border': isLight ? '#e0e0db' : '#2a2e29',
      '--border2': isLight ? '#d4d4cd' : '#333733',
      '--text': isLight ? '#1a1c1a' : '#d4d8d3',
      '--text2': isLight ? '#4a4d4a' : '#8a9088',
      '--text3': isLight ? '#7a7d7a' : '#5a5f58',
      '--accent': isLight ? '#2d8a4e' : '#6bde8c',
      '--accent2': isLight ? '#1e6334' : '#4ab86a'
    };
    
    // More robust replacement using a single pass
    rawText = rawText.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g, (match, varName) => {
      return themeVars[varName] || match;
    });

    try {
      mermaid.render(id, rawText).then(({svg}) => {
        el.innerHTML = svg;
        
        // Add click listener to show in modal
        const wrapper = el.closest('.mermaid-wrapper');
        if (wrapper) {
          wrapper.onclick = () => {
            const modal = document.getElementById('mermaid-modal');
            const modalSvg = document.getElementById('mermaid-modal-svg');
            modalSvg.innerHTML = svg;
            modal.style.display = 'flex';
          };
        }
      }).catch(err => {
        console.error('Mermaid render error:', err);
        el.innerHTML = `<pre style="color:var(--pink);font-size:12px;white-space:pre-wrap;border:1px solid var(--pink);padding:10px;border-radius:4px;">Mermaid Syntax Error:\n${err.message}\n\nRaw Text:\n${rawText}</pre>`;
      });
    } catch(e) { 
      console.error('Mermaid sync error:', e);
    }
  });

  body.classList.add('animate-in');
  setTimeout(() => body.classList.remove('animate-in'), 300);

  // restore scroll
  const pane = document.getElementById('content-pane');
  pane.scrollTop = openTabs[id]?.scrollTop || 0;
  pane.onscroll = () => {
    if (openTabs[id]) openTabs[id].scrollTop = pane.scrollTop;
  };

  // Handle wikilinks — make them clickable
  body.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http')) return;
    a.addEventListener('click', e => {
      e.preventDefault();
      const title = decodeURIComponent(href).replace(/\.md$/, '').replace(/^.*\//, '');
      const target = FILTERED_INDEX.find(n => {
        const normalize = s => s.replace(/[,;:—–]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        return n.title === title || n.filename.replace('.md','') === title
          || normalize(n.title) === normalize(title);
      });
      if (target) openNote(target.id);
    });
  });
}

function showWelcome() {
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('note-screen').style.display = 'none';
  document.getElementById('search-screen').style.display = 'none';
  document.getElementById('outline-screen').style.display = 'none';
}

// ── SEARCH ──
function doSearch(query) {
  if (!query.trim()) {
    searchActive = false;
    document.getElementById('search-screen').style.display = 'none';
    if (activeTabId) {
      renderNote(activeTabId);
    } else {
      showWelcome();
    }
    return;
  }

  searchActive = true;
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('note-screen').style.display = 'none';
  document.getElementById('search-screen').style.display = 'flex';

  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(t => t.length > 0);
  const results = [];

  for (const note of FILTERED_INDEX) {
    const titleLower = note.title.toLowerCase();
    const contentLower = SEARCH_INDEX[note.id] || '';

    // Multi-term scoring
    let score = 0;
    let matchedTerms = 0;
    let bestContentIdx = -1;

    for (const term of terms) {
      const inTitle = titleLower.includes(term);
      const cIdx = contentLower.indexOf(term);
      if (inTitle) { score += 3; matchedTerms++; }
      if (cIdx !== -1) { score += 1; matchedTerms++; if (bestContentIdx === -1) bestContentIdx = cIdx; }
    }

    // Bonus for exact full query match
    if (titleLower.includes(q)) score += 5;
    if (contentLower.includes(q) && bestContentIdx === -1) bestContentIdx = contentLower.indexOf(q);

    // Only include if at least one term matched
    if (matchedTerms === 0) continue;

    // Build snippet from best match position
    let snippet = '';
    const snippetIdx = bestContentIdx !== -1 ? bestContentIdx : -1;
    if (snippetIdx !== -1) {
      const start = Math.max(0, snippetIdx - 80);
      const end = Math.min(contentLower.length, snippetIdx + 120);
      snippet = contentLower.slice(start, end);
      if (start > 0) snippet = '…' + snippet;
      if (end < contentLower.length) snippet += '…';
      // highlight all terms
      for (const term of terms) {
        const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        snippet = snippet.replace(re, m => `<mark>${m}</mark>`);
      }
    }
    results.push({ note, snippet, score });
  }

  results.sort((a, b) => b.score - a.score);

  const container = document.getElementById('search-results');
  container.innerHTML = `<div class="search-header">${results.length} result${results.length !== 1 ? 's' : ''} for "<strong style="color:var(--text)">${query}</strong>"</div>`;

  if (results.length === 0) {
    container.innerHTML += '<div class="empty-state">No notes found.</div>';
    return;
  }

  for (const r of results.slice(0, 50)) {
    const item = document.createElement('div');
    item.className = 'search-result-item animate-in';
    const cfg = PHASE_CONFIG[r.note.folder] || {};
    item.innerHTML = `
      <div class="search-result-title">${terms.reduce((t, term) => t.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`), r.note.title)}</div>
      <div class="search-result-path">${cfg.label || r.note.folder}${r.note.subfolder ? ' › ' + r.note.subfolder.replace(/^Module-\d+-/, '').replace(/-/g, ' ') : ''}</div>
      ${r.snippet ? `<div class="search-result-snippet">${r.snippet}</div>` : ''}
    `;
    item.addEventListener('click', () => {
      document.getElementById('search').value = '';
      searchActive = false;
      openNote(r.note.id);
    });
    container.appendChild(item);
  }
}

// ── OUTLINE ──
function buildOutline(id) {
  const content = NOTE_CACHE[id] || '';
  const headings = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)/);
    if (m) headings.push({ level: m[1].length, text: m[2].replace(/\*\*/g, '') });
  }

  const list = document.getElementById('outline-list');
  list.innerHTML = '';

  if (headings.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:20px 0;font-size:12px;">No headings found.</div>';
    return;
  }

  for (const h of headings) {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 5px ${(h.level - 1) * 12 + 8}px;
      font-size: ${Math.max(11, 14 - h.level)}px;
      color: ${h.level === 1 ? 'var(--text)' : h.level === 2 ? 'var(--text2)' : 'var(--text3)'};
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.1s;
      ${h.level === 2 ? 'font-weight:500;margin-top:4px;' : ''}
    `;
    item.textContent = h.text;
    item.addEventListener('mouseenter', () => item.style.background = 'var(--surface)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
      // scroll to heading in note body
      const noteBody = document.getElementById('note-body');
      const els = noteBody.querySelectorAll('h1,h2,h3,h4');
      for (const el of els) {
        if (el.textContent.trim() === h.text) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
      }
    });
    list.appendChild(item);
  }
}

// ── RESIZE HANDLE ──
const resizeHandle = document.getElementById('resize-handle');
let resizing = false;
resizeHandle.addEventListener('mousedown', e => {
  resizing = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
  if (!resizing) return;
  const sidebar = document.getElementById('sidebar');
  const newW = Math.min(Math.max(180, e.clientX), 480);
  sidebar.style.width = newW + 'px';
  sidebar.style.minWidth = newW + 'px';
});
document.addEventListener('mouseup', () => {
  resizing = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ── VIEW BUTTONS ──
document.getElementById('view-files').addEventListener('click', () => {
  document.getElementById('view-files').classList.add('active');
  document.getElementById('view-outline').classList.remove('active');
  outlineActive = false;
  document.getElementById('sidebar').style.display = '';
  document.getElementById('outline-screen').style.display = 'none';
});

document.getElementById('view-outline').addEventListener('click', () => {
  document.getElementById('view-outline').classList.add('active');
  document.getElementById('view-files').classList.remove('active');
  outlineActive = true;

  if (activeTabId) {
    document.getElementById('outline-screen').style.display = 'flex';
    buildOutline(activeTabId);
    // swap sidebar for outline
    document.getElementById('sidebar').style.display = 'none';
    const layout = document.getElementById('layout');
    const outlineScreen = document.getElementById('outline-screen');
    layout.insertBefore(outlineScreen, document.getElementById('resize-handle'));
  }
});

// ── SEARCH INPUT ──
document.getElementById('search').addEventListener('input', e => {
  doSearch(e.target.value);
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search').focus();
    document.getElementById('search').select();
  }
  if (e.key === 'Escape') {
    document.getElementById('search').value = '';
    doSearch('');
    document.getElementById('search').blur();
  }
});

// ── WELCOME STATS ──
function renderWelcomeStats() {
  const phases = new Set(FILTERED_INDEX.map(n => n.folder)).size;
  const notes = FILTERED_INDEX.filter(n => !n.is_moc).length;
  const mods = new Set(FILTERED_INDEX.map(n => n.subfolder).filter(Boolean)).size;
  const stats = [
    { num: notes, label: 'Notes' },
    { num: mods, label: 'Modules' },
    { num: phases, label: 'Phases' },
  ];
  const el = document.getElementById('welcome-stats');
  el.innerHTML = stats.map(s => `
    <div class="stat-box">
      <div class="stat-num">${s.num}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

// ── INIT ──
async function init() {
  const indexRes = await fetch('data/vault-index.json');
  VAULT_INDEX = await indexRes.json();
  FILTERED_INDEX = VAULT_INDEX.filter(n => !n.title.includes('{{title}}') && !n.id.includes('Note_Template'));

  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;

  if (localStorage.getItem('theme') === 'light') {
    body.classList.add('light-mode');
  }

  themeToggle.addEventListener('click', () => {
    const isLight = body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    
    // Re-init mermaid and re-render current note if open
    initMermaid(isLight);
    if (activeTabId) {
      renderNote(activeTabId);
    }
  });

  // Scroll Tracking
  const pane = document.getElementById('content-pane');
  const progress = document.getElementById('reading-progress');
  pane.addEventListener('scroll', () => {
    const total = pane.scrollHeight - pane.clientHeight;
    const current = pane.scrollTop;
    if (total > 0) {
      progress.style.width = (current / total * 100) + '%';
    }
  });

  buildSidebar();
  renderWelcomeStats();

  // Background loads for heavy features
  fetch('data/search-index.json').then(r => r.json()).then(data => SEARCH_INDEX = data).catch(console.error);
  fetch('data/graph-edges.json').then(r => r.json()).then(data => GRAPH_EDGES = data).catch(console.error);
}
init();
// ── MOBILE SIDEBAR TOGGLE ──
const mobileToggle = document.getElementById('mobile-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
function toggleMobileSidebar() {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('mobile-open');
  sidebarOverlay.style.display = sb.classList.contains('mobile-open') ? 'block' : 'none';
}
mobileToggle.addEventListener('click', toggleMobileSidebar);
sidebarOverlay.addEventListener('click', toggleMobileSidebar);

// Close sidebar on mobile when a note is opened
const origOpenNote = openNote;
openNote = function(id) {
  origOpenNote(id);
  const sb = document.getElementById('sidebar');
  if (sb.classList.contains('mobile-open')) {
    sb.classList.remove('mobile-open');
    sidebarOverlay.style.display = 'none';
  }
};

// Auto-open How to Study if exists
const howTo = FILTERED_INDEX.find(n => n.title.includes('How to Study'));
if (howTo) openNote(howTo.id);

// ── GRAPH VIEW ──
let graphInitialized = false;
let graphSimulation = null;

const GRAPH_PHASE_COLORS = {
  '00-Meta': '#a78bfa',
  '01-Phase-1-Foundations': '#6bde8c',
  '02-Phase-2-Distribution': '#6baade',
  '03-Phase-3-Architecture-Operations': '#e8d06b',
  '04-Phase-4-Modern-AI': '#de6b8a',
  '05-Capstones': '#de956b'
};
const GRAPH_PHASE_LABELS = {
  '00-Meta': 'Meta',
  '01-Phase-1-Foundations': 'Phase 1',
  '02-Phase-2-Distribution': 'Phase 2',
  '03-Phase-3-Architecture-Operations': 'Phase 3',
  '04-Phase-4-Modern-AI': 'Phase 4',
  '05-Capstones': 'Capstones'
};

function buildGraphData() {
  const nodes = FILTERED_INDEX.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    is_moc: n.is_moc,
    links: 0
  }));

  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  const links = [];

  for (const edge of GRAPH_EDGES) {
    if (nodeMap[edge.source] && nodeMap[edge.target]) {
      links.push({ source: edge.source, target: edge.target });
      nodeMap[edge.source].links++;
      nodeMap[edge.target].links++;
    }
  }

  return { nodes, links };
}

function initGraph() {
  if (graphInitialized) return;
  graphInitialized = true;

  const { nodes, links } = buildGraphData();
  const svg = d3.select('#graph-svg');
  const container = document.getElementById('graph-screen');

  // Legend
  const legend = document.getElementById('graph-legend');
  legend.innerHTML = '';
  for (const [folder, color] of Object.entries(GRAPH_PHASE_COLORS)) {
    const item = document.createElement('div');
    item.className = 'graph-legend-item';
    item.innerHTML = `<div class="graph-legend-dot" style="background:${color}"></div>${GRAPH_PHASE_LABELS[folder] || folder}`;
    legend.appendChild(item);
  }

  // Info
  const info = document.getElementById('graph-info');
  info.textContent = `${nodes.length} notes · ${links.length} connections · scroll to zoom · drag to pan`;

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  svg.attr('viewBox', [0, 0, width, height]);

  const g = svg.append('g');

  // Zoom
  let currentTransform = d3.zoomIdentity;
  const zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => {
      currentTransform = event.transform;
      g.attr('transform', event.transform);
      updateMinimap();
    });
  svg.call(zoom);

  // Links
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke-width', 0.5);

  // Nodes
  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node');

  const maxLinks = Math.max(...nodes.map(n => n.links), 1);
  node.append('circle')
    .attr('r', d => 3 + Math.sqrt(d.links / maxLinks) * 8)
    .attr('fill', d => GRAPH_PHASE_COLORS[d.folder] || '#555')
    .attr('stroke', d => GRAPH_PHASE_COLORS[d.folder] || '#555')
    .attr('fill-opacity', d => d.is_moc ? 0.9 : 0.6)
    .attr('stroke-opacity', 0.8);

  node.append('text')
    .text(d => d.title.length > 28 ? d.title.slice(0, 26) + '…' : d.title)
    .attr('x', d => 5 + Math.sqrt(d.links / maxLinks) * 8)
    .attr('y', 3)
    .style('font-size', d => d.is_moc ? '10px' : '9px')
    .style('font-weight', d => d.is_moc ? '600' : '400');

  // Hover highlight
  const linkedByIndex = new Set();
  links.forEach(l => {
    linkedByIndex.add(l.source + '|' + l.target);
    linkedByIndex.add(l.target + '|' + l.source);
  });

  function isConnected(a, b) {
    return a === b || linkedByIndex.has(a + '|' + b);
  }

  node.on('mouseenter', function(event, d) {
    if (graphSearchQuery) return; // Don't override search highlighting
    node.classed('dimmed', o => !isConnected(d.id, o.id));
    link.classed('dimmed', l => l.source.id !== d.id && l.target.id !== d.id);
    link.classed('highlighted', l => l.source.id === d.id || l.target.id === d.id);
    d3.select(this).select('text').style('fill', 'var(--text)').style('font-size', '11px');
  }).on('mouseleave', function() {
    if (graphSearchQuery) return;
    node.classed('dimmed', false);
    link.classed('dimmed', false).classed('highlighted', false);
    d3.select(this).select('text').style('fill', null).style('font-size', null);
  });

  // Click to navigate
  node.on('click', (event, d) => {
    event.stopPropagation();
    document.getElementById('view-files').click();
    openNote(d.id);
  });

  // Drag
  function drag(simulation) {
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
  }

  // Cluster positions (by module/subfolder)
  const moduleSet = [...new Set(FILTERED_INDEX.map(n => n.subfolder || n.folder))];
  const modulePositions = {};
  const cols = Math.ceil(Math.sqrt(moduleSet.length));
  moduleSet.forEach((mod, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    modulePositions[mod] = {
      x: (col + 0.5) * (width / cols),
      y: (row + 0.5) * (height / Math.ceil(moduleSet.length / cols))
    };
  });

  // Simulation
  graphSimulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(60).strength(0.3))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => 6 + Math.sqrt(d.links / maxLinks) * 8))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
      updateMinimap();
    });

  node.call(drag(graphSimulation));

  // ── GRAPH SEARCH ──
  let graphSearchQuery = '';
  document.getElementById('graph-search').addEventListener('input', (e) => {
    graphSearchQuery = e.target.value.toLowerCase().trim();
    if (!graphSearchQuery) {
      node.classed('dimmed', false).classed('search-match', false);
      link.classed('dimmed', false);
      node.select('text').style('fill', null).style('font-size', null);
      info.textContent = `${nodes.length} notes · ${links.length} connections · scroll to zoom · drag to pan`;
      return;
    }
    let matchCount = 0;
    const matchIds = new Set();
    node.each(function(d) {
      const isMatch = d.title.toLowerCase().includes(graphSearchQuery);
      if (isMatch) { matchCount++; matchIds.add(d.id); }
    });
    node.classed('dimmed', d => !matchIds.has(d.id));
    node.classed('search-match', d => matchIds.has(d.id));
    node.select('text').style('fill', d => matchIds.has(d.id) ? 'var(--text)' : null)
      .style('font-size', d => matchIds.has(d.id) ? '11px' : null);
    link.classed('dimmed', l => !matchIds.has(l.source.id) && !matchIds.has(l.target.id));
    info.textContent = `${matchCount} match${matchCount !== 1 ? 'es' : ''} of ${nodes.length} notes`;
  });

  // ── CLUSTER TOGGLE ──
  let clusterMode = false;
  document.getElementById('graph-cluster-toggle').addEventListener('click', () => {
    clusterMode = !clusterMode;
    document.getElementById('graph-cluster-toggle').classList.toggle('active', clusterMode);

    if (clusterMode) {
      graphSimulation
        .force('x', d3.forceX(d => {
          const mod = FILTERED_INDEX.find(n => n.id === d.id)?.subfolder || FILTERED_INDEX.find(n => n.id === d.id)?.folder;
          return modulePositions[mod]?.x || width / 2;
        }).strength(0.4))
        .force('y', d3.forceY(d => {
          const mod = FILTERED_INDEX.find(n => n.id === d.id)?.subfolder || FILTERED_INDEX.find(n => n.id === d.id)?.folder;
          return modulePositions[mod]?.y || height / 2;
        }).strength(0.4))
        .force('center', null)
        .force('charge', d3.forceManyBody().strength(-60));
    } else {
      graphSimulation
        .force('x', null)
        .force('y', null)
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('charge', d3.forceManyBody().strength(-120));
    }
    graphSimulation.alpha(0.8).restart();
  });

  // ── MINI-MAP ──
  const minimapContainer = document.getElementById('graph-minimap');
  const mmWidth = 160, mmHeight = 120;
  const mmSvg = d3.select(minimapContainer).append('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const mmG = mmSvg.append('g');
  const mmLinks = mmG.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', 'var(--border2)').attr('stroke-opacity', 0.2).attr('stroke-width', 0.5);
  const mmNodes = mmG.append('g').selectAll('circle').data(nodes).join('circle')
    .attr('r', 2)
    .attr('fill', d => GRAPH_PHASE_COLORS[d.folder] || '#555')
    .attr('fill-opacity', 0.7);
  const mmViewport = mmSvg.append('rect').attr('class', 'minimap-viewport');

  function updateMinimap() {
    mmLinks
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    mmNodes.attr('cx', d => d.x).attr('cy', d => d.y);

    // Viewport rect
    const t = currentTransform;
    const vx = -t.x / t.k;
    const vy = -t.y / t.k;
    const vw = width / t.k;
    const vh = height / t.k;
    mmViewport.attr('x', vx).attr('y', vy).attr('width', vw).attr('height', vh);
  }

  // Click on minimap to pan
  mmSvg.on('click', function(event) {
    const [mx, my] = d3.pointer(event);
    const svgRect = mmSvg.node().getBoundingClientRect();
    const scaleX = width / svgRect.width;
    const scaleY = height / svgRect.height;
    const targetX = mx * scaleX;
    const targetY = my * scaleY;
    const newTransform = d3.zoomIdentity.translate(width/2 - targetX * currentTransform.k, height/2 - targetY * currentTransform.k).scale(currentTransform.k);
    svg.transition().duration(500).call(zoom.transform, newTransform);
  });

  // Fit graph after settling
  setTimeout(() => {
    const bounds = g.node().getBBox();
    if (bounds.width > 0 && bounds.height > 0) {
      const padding = 40;
      const scale = Math.min(
        (width - padding * 2) / bounds.width,
        (height - padding * 2) / bounds.height,
        1.5
      );
      const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
      svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
  }, 3000);
}

// ── GRAPH VIEW BUTTON ──
document.getElementById('view-graph').addEventListener('click', () => {
  document.querySelectorAll('.header-pills .pill').forEach(p => p.classList.remove('active'));
  document.getElementById('view-graph').classList.add('active');
  outlineActive = false;

  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('note-screen').style.display = 'none';
  document.getElementById('search-screen').style.display = 'none';
  document.getElementById('outline-screen').style.display = 'none';
  document.getElementById('study-screen').style.display = 'none';
  document.getElementById('canvas-screen').style.display = 'none';
  document.getElementById('graph-screen').style.display = 'flex';

  initGraph();
});

// ── CANVAS VIEW BUTTON ──
document.getElementById('view-canvas').addEventListener('click', () => {
  document.querySelectorAll('.header-pills .pill').forEach(p => p.classList.remove('active'));
  document.getElementById('view-canvas').classList.add('active');
  outlineActive = false;

  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('note-screen').style.display = 'none';
  document.getElementById('search-screen').style.display = 'none';
  document.getElementById('outline-screen').style.display = 'none';
  document.getElementById('study-screen').style.display = 'none';
  document.getElementById('graph-screen').style.display = 'none';
  document.getElementById('canvas-screen').style.display = 'flex';

  if (typeof initCanvas === 'function') initCanvas();
});

// Update Files and Outline buttons to hide graph and canvas
document.getElementById('view-files').addEventListener('click', () => {
  document.getElementById('view-graph').classList.remove('active');
  document.getElementById('view-canvas').classList.remove('active');
  document.getElementById('view-study')?.classList.remove('active');
  document.getElementById('graph-screen').style.display = 'none';
  document.getElementById('canvas-screen').style.display = 'none';
  document.getElementById('study-screen').style.display = 'none';
  document.getElementById('sidebar').style.display = '';
  if (activeTabId) {
    renderNote(activeTabId);
  } else {
    showWelcome();
  }
});

document.getElementById('view-outline').addEventListener('click', () => {
  document.getElementById('view-graph').classList.remove('active');
  document.getElementById('view-canvas').classList.remove('active');
  document.getElementById('graph-screen').style.display = 'none';
  document.getElementById('canvas-screen').style.display = 'none';
});

// ── STUDY MODE ──
let ALL_STUDY_PROMPTS = [];
let studyPrompts = [];
let studyIndex = 0;
let studyPhaseFilter = 'all';

// Load prompts once
fetch('data/study-prompts.json')
  .then(r => r.json())
  .then(data => { ALL_STUDY_PROMPTS = data; })
  .catch(console.error);

function getFilteredPrompts(phaseFilter) {
  let filtered = phaseFilter === 'all' 
    ? [...ALL_STUDY_PROMPTS] 
    : ALL_STUDY_PROMPTS.filter(p => p.folder === phaseFilter);
  
  // Shuffle (Fisher-Yates)
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
  }
  return filtered;
}

function renderStudyCard() {
  if (studyIndex >= studyPrompts.length) {
    document.getElementById('study-note-label').textContent = '';
    document.getElementById('study-prompt').innerHTML = '';
    document.getElementById('study-answer').style.display = 'none';
    document.getElementById('study-actions').innerHTML = `<button class="study-btn study-btn-primary" onclick="restartStudy()">Study Again</button>`;
    document.getElementById('study-prompt').innerHTML = `
      <div class="study-complete">
        <div class="study-complete-icon">✓</div>
        <div class="study-complete-title">Session Complete</div>
        <div class="study-complete-sub">You reviewed ${studyPrompts.length} reflection prompt${studyPrompts.length !== 1 ? 's' : ''}.</div>
      </div>
    `;
    document.getElementById('study-progress-fill').style.width = '100%';
    document.getElementById('study-progress-text').textContent = `${studyPrompts.length} / ${studyPrompts.length}`;
    return;
  }

  const prompt = studyPrompts[studyIndex];
  const cfg = PHASE_CONFIG[prompt.folder] || {};

  document.getElementById('study-progress-fill').style.width = `${(studyIndex / studyPrompts.length) * 100}%`;
  document.getElementById('study-progress-text').textContent = `${studyIndex + 1} / ${studyPrompts.length}`;
  document.getElementById('study-note-label').textContent = `${cfg.short || ''} · ${prompt.noteTitle}`;
  document.getElementById('study-prompt').textContent = prompt.text;

  document.getElementById('study-answer').style.display = 'none';
  if (prompt.mentalSnippet) {
    document.getElementById('study-answer').innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Mental Model from this note</div>` + marked.parse(prompt.mentalSnippet);
  } else {
    document.getElementById('study-answer').innerHTML = '<em style="color:var(--text3)">Open the note for full context.</em>';
  }

  document.getElementById('study-reveal').style.display = '';
  document.getElementById('study-next').style.display = 'none';
  document.getElementById('study-open').style.display = 'none';
}

function restartStudy() {
  studyPrompts = getFilteredPrompts(studyPhaseFilter);
  studyIndex = 0;
  renderStudyCard();
  // Restore buttons
  document.getElementById('study-actions').innerHTML = `
    <button id="study-reveal" class="study-btn study-btn-primary">Reveal Answer</button>
    <button id="study-next" class="study-btn study-btn-primary" style="display:none;">Next Prompt</button>
    <button id="study-open" class="study-btn study-btn-secondary" style="display:none;">Open Note</button>
  `;
  bindStudyButtons();
}

function bindStudyButtons() {
  document.getElementById('study-reveal').addEventListener('click', () => {
    document.getElementById('study-answer').style.display = '';
    document.getElementById('study-reveal').style.display = 'none';
    document.getElementById('study-next').style.display = '';
    document.getElementById('study-open').style.display = '';
  });
  document.getElementById('study-next').addEventListener('click', () => {
    studyIndex++;
    renderStudyCard();
  });
  document.getElementById('study-open').addEventListener('click', () => {
    if (studyPrompts[studyIndex]) {
      document.getElementById('view-files').click();
      openNote(studyPrompts[studyIndex].noteId);
    }
  });
}

function initStudyMode() {
  studyPrompts = getFilteredPrompts(studyPhaseFilter);
  studyIndex = 0;

  // Build phase filter buttons
  const phaseBtns = document.getElementById('study-phase-btns');
  phaseBtns.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'study-phase-btn active';
  allBtn.textContent = `All (${ALL_STUDY_PROMPTS.length})`;
  allBtn.addEventListener('click', () => {
    studyPhaseFilter = 'all';
    updateStudyFilters();
    restartStudy();
  });
  phaseBtns.appendChild(allBtn);

  for (const [folder, cfg] of Object.entries(PHASE_CONFIG)) {
    const count = ALL_STUDY_PROMPTS.filter(p => p.folder === folder).length;
    if (count === 0) continue;
    const btn = document.createElement('button');
    btn.className = 'study-phase-btn';
    btn.textContent = `${cfg.short} (${count})`;
    btn.dataset.folder = folder;
    btn.addEventListener('click', () => {
      studyPhaseFilter = folder;
      updateStudyFilters();
      restartStudy();
    });
    phaseBtns.appendChild(btn);
  }

  renderStudyCard();
  bindStudyButtons();
}

function updateStudyFilters() {
  document.querySelectorAll('.study-phase-btn').forEach(btn => {
    const isAll = !btn.dataset.folder;
    btn.classList.toggle('active', isAll ? studyPhaseFilter === 'all' : btn.dataset.folder === studyPhaseFilter);
  });
}

document.getElementById('view-study').addEventListener('click', () => {
  // Deactivate other views
  document.querySelectorAll('.header-pills .pill').forEach(p => p.classList.remove('active'));
  document.getElementById('view-study').classList.add('active');
  outlineActive = false;

  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('welcome-screen').style.display = 'none';
  document.getElementById('note-screen').style.display = 'none';
  document.getElementById('search-screen').style.display = 'none';
  document.getElementById('outline-screen').style.display = 'none';
  document.getElementById('graph-screen').style.display = 'none';
  document.getElementById('study-screen').style.display = 'flex';

  initStudyMode();
});

// Update Files/Outline/Graph buttons to also hide study screen
const hideStudy = () => document.getElementById('study-screen').style.display = 'none';

// ── OBSIDIAN EXPORT ──
document.getElementById('btn-export').addEventListener('click', async function() {
  const btn = this;
  if (btn.classList.contains('exporting')) return;
  btn.classList.add('exporting');
  btn.textContent = '↓ Building…';

  try {
    const zip = new JSZip();

    // Phase folder names
    const phaseFolders = {
      '00-Meta': 'Meta',
      '01-Phase-1-Foundations': 'Phase-1-Foundations',
      '02-Phase-2-Distribution': 'Phase-2-Distribution',
      '03-Phase-3-Architecture-Operations': 'Phase-3-Architecture-Operations',
      '04-Phase-4-Modern-AI': 'Phase-4-Modern-AI',
      '05-Capstones': 'Capstones'
    };

    for (const note of FILTERED_INDEX) {
      let content = NOTE_CACHE[note.id];
      if (!content) {
        try {
          const res = await fetch(`data/notes/${note.id}.md`);
          content = await res.text();
          NOTE_CACHE[note.id] = content; // cache it for later
        } catch (e) {
          console.error('Failed to fetch for export:', note.id);
          content = '';
        }
      }

      const phaseFolder = phaseFolders[note.folder] || note.folder;

      // Build path
      let path;
      if (note.subfolder) {
        const modClean = note.subfolder.replace(/-/g, ' ');
        if (note.is_moc) {
          path = `${phaseFolder}/${modClean}/_${note.title}.md`;
        } else {
          path = `${phaseFolder}/${modClean}/${note.title}.md`;
        }
      } else {
        if (note.is_moc) {
          path = `${phaseFolder}/_${note.title}.md`;
        } else {
          path = `${phaseFolder}/${note.title}.md`;
        }
      }

      // Clean path of characters that cause filesystem issues
      path = path.replace(/[<>:"|?*]/g, '');

      // YAML frontmatter
      const tags = note.tags ? note.tags.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean) : [];
      let frontmatter = '---\n';
      frontmatter += `title: "${note.title.replace(/"/g, '\\"')}"\n`;
      if (tags.length) frontmatter += `tags: [${tags.map(t => `"${t}"`).join(', ')}]\n`;
      if (note.phase) frontmatter += `phase: ${note.phase}\n`;
      if (note.module) frontmatter += `module: ${note.module}\n`;
      if (note.status) frontmatter += `status: ${note.status}\n`;
      if (note.is_moc) frontmatter += `is_moc: true\n`;
      if (note.last_updated) frontmatter += `last_updated: ${note.last_updated}\n`;
      frontmatter += '---\n\n';

      zip.file(path, frontmatter + content);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'system-design-vault-obsidian.zip';
    a.click();
    URL.revokeObjectURL(url);

    btn.textContent = '✓ Done';
    setTimeout(() => { btn.textContent = '↓ Obsidian'; }, 2000);
  } catch (err) {
    console.error('Export failed:', err);
    btn.textContent = '✗ Error';
    setTimeout(() => { btn.textContent = '↓ Obsidian'; }, 2000);
  } finally {
    btn.classList.remove('exporting');
  }
});

// ── MERMAID MODAL HANDLERS ──
document.getElementById('mermaid-modal-close').addEventListener('click', () => {
  document.getElementById('mermaid-modal').style.display = 'none';
});

document.getElementById('mermaid-modal').addEventListener('click', (e) => {
  if (e.target.id === 'mermaid-modal') {
    document.getElementById('mermaid-modal').style.display = 'none';
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('mermaid-modal');
    if (modal.style.display === 'flex') {
      modal.style.display = 'none';
    }
  }
});
