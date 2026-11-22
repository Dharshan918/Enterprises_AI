// Core DOM references
const chat = document.getElementById('chat');
const form = document.getElementById('chatForm');
const question = document.getElementById('question');
const trace = document.getElementById('trace');
const sourceUsed = document.getElementById('sourceUsed');

// Utility functions
function escapeHtml(s = '') {
  return s.replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function formatText(s = '') {
  return escapeHtml(s).replace(/\n/g, '<br>');
}

// Append message bubble with animation and scroll
function addMessage(role, text, source = '', citations = []) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const citeHtml = citations.length
    ? `<div class="citations"><strong><i class="bi bi-link-45deg me-1"></i>Sources</strong><br>${citations
        .map(c => c.url
          ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>${escapeHtml(c.title)}</a>`
          : `<span class="badge bg-dark border border-secondary me-1"><i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(c.title)}</span>`
        ).join('<br>')}</div>`
    : '';

  const avatarContent = role === 'assistant' ? 'HR' : 'YOU';

  wrap.innerHTML = `
    <div class="avatar">${avatarContent}</div>
    <div class="bubble">
      ${formatText(text)}
      ${source ? `<div class="answer-source"><i class="bi bi-shield-check me-1"></i>Source: ${escapeHtml(source)}</div>` : ''}
      ${citeHtml}
    </div>
  `;

  chat.appendChild(wrap);
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
}

// Update source indicator styling
function updateSourceStyle(val) {
  if (!sourceUsed) return;
  sourceUsed.textContent = val;
  if (val === 'Running') {
    sourceUsed.style.color = '#fbbf24';
    sourceUsed.style.borderColor = 'rgba(251, 191, 36, 0.4)';
  } else if (val === 'Error') {
    sourceUsed.style.color = '#f87171';
    sourceUsed.style.borderColor = 'rgba(248, 113, 113, 0.4)';
  } else if (val && val !== '—') {
    sourceUsed.style.color = '#34d399';
    sourceUsed.style.borderColor = 'rgba(52, 211, 153, 0.4)';
  } else {
    sourceUsed.style.color = '';
    sourceUsed.style.borderColor = '';
  }
}

// Render trace execution steps
function renderTrace(items = []) {
  if (!trace) return;
  if (items.length) {
    trace.innerHTML = items
      .map(x => `<div class="trace-item"><i class="bi bi-arrow-return-right me-1 text-accent opacity-75"></i>${escapeHtml(x)}</div>`)
      .join('');
  } else {
    trace.innerHTML = '<div class="empty"><i class="bi bi-clock-history d-block fs-3 mb-2 opacity-50"></i>No trace.</div>';
  }
  trace.scrollTop = trace.scrollHeight;
}

// Auto-resize textarea according to text content
function autoResizeTextarea() {
  if (!question) return;
  question.style.height = 'auto';
  question.style.height = Math.min(question.scrollHeight, 130) + 'px';
}

if (question) {
  question.addEventListener('input', autoResizeTextarea);
  // Send on Enter (Shift+Enter inserts newline)
  question.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    }
  });
}

// Main askAgent invocation logic
async function askAgent(q) {
  addMessage('user', q);
  if (question) {
    question.value = '';
    question.style.height = 'auto';
  }
  renderTrace(['Running LangGraph workflow...']);
  updateSourceStyle('Running');

  const btn = form ? form.querySelector('button') : null;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');

    addMessage('assistant', data.answer, data.source_used, data.citations || []);
    renderTrace(data.trace || []);
    updateSourceStyle(data.source_used || '—');
  } catch (e) {
    addMessage('assistant', `Error: ${e.message}`);
    renderTrace(['Request failed']);
    updateSourceStyle('Error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Chat form submission
if (form) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = question ? question.value.trim() : '';
    if (q) askAgent(q);
  });
}

// Example prompt chips
document.querySelectorAll('.example').forEach(b => {
  b.addEventListener('click', () => {
    const text = b.textContent.trim();
    if (text) askAgent(text);
  });
});

// Document upload modal handlers
const modal = document.getElementById('uploadModal');
const openUploadBtn = document.getElementById('openUpload');
const closeUploadBtn = document.getElementById('closeUpload');
const uploadBtn = document.getElementById('uploadBtn');

if (openUploadBtn && modal) {
  openUploadBtn.onclick = () => modal.classList.remove('hidden');
}

if (closeUploadBtn && modal) {
  closeUploadBtn.onclick = () => modal.classList.add('hidden');
}

// Close modal when clicking outside card or pressing Escape
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });
}

if (uploadBtn) {
  uploadBtn.onclick = async () => {
    const fileEl = document.getElementById('fileInput');
    const keyEl = document.getElementById('adminKey');
    const status = document.getElementById('uploadStatus');

    const file = fileEl ? fileEl.files[0] : null;
    const key = keyEl ? keyEl.value : '';

    if (!file) {
      if (status) {
        status.textContent = 'Choose a file first.';
        status.style.color = '#fbbf24';
      }
      return;
    }

    if (status) {
      status.textContent = 'Indexing document into vectorstore...';
      status.style.color = '#38bdf8';
    }

    const fd = new FormData();
    fd.append('file', file);

    try {
      const r = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'X-Admin-Key': key },
        body: fd
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Upload failed');

      if (status) {
        status.textContent = `✓ Indexed ${d.file}: ${d.chunks} chunks.`;
        status.style.color = '#34d399';
      }
      if (fileEl) fileEl.value = '';
    } catch (e) {
      if (status) {
        status.textContent = `Error: ${e.message}`;
        status.style.color = '#f87171';
      }
    }
  };
}

// Drawer controls for tablet / mobile responsive views
const sidebar = document.getElementById('sidebar');
const tracePanel = document.getElementById('tracePanel');
const backdrop = document.getElementById('panelBackdrop');
const openSidebarBtn = document.getElementById('openSidebar');
const closeSidebarBtn = document.getElementById('closeSidebar');
const openTraceBtn = document.getElementById('openTrace');
const closeTraceBtn = document.getElementById('closeTrace');

function closeAllDrawers() {
  if (sidebar) sidebar.classList.remove('open');
  if (tracePanel) tracePanel.classList.remove('open');
  if (backdrop) backdrop.classList.add('hidden');
}

if (openSidebarBtn && sidebar && backdrop) {
  openSidebarBtn.onclick = () => {
    sidebar.classList.add('open');
    if (tracePanel) tracePanel.classList.remove('open');
    backdrop.classList.remove('hidden');
  };
}

if (closeSidebarBtn) {
  closeSidebarBtn.onclick = closeAllDrawers;
}

if (openTraceBtn && tracePanel && backdrop) {
  openTraceBtn.onclick = () => {
    tracePanel.classList.add('open');
    if (sidebar) sidebar.classList.remove('open');
    backdrop.classList.remove('hidden');
  };
}

if (closeTraceBtn) {
  closeTraceBtn.onclick = closeAllDrawers;
}

if (backdrop) {
  backdrop.onclick = closeAllDrawers;
}
