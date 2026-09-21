// ── State ──────────────────────────────────────────────────────────────────
let notes = [];
let editingNoteId = null;
let deleteTargetId = null;
let isPinned = false;
let isPinnedToDesktop = true;
let searchQuery = '';

// ── DOM Refs ───────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const notesContainer = $('#notes-container');
const emptyState = $('#empty-state');
const searchInput = $('#search-input');
const statusText = $('#status-text');
const statusPending = $('#status-pending');
const modalOverlay = $('#modal-overlay');
const modalTitle = $('#modal-title');
const confirmOverlay = $('#confirm-overlay');
const confirmNoteTitle = $('#confirm-note-title');
const btnPin = $('#btn-pin');
const btnPinDesktop = $('#btn-pin-desktop');
const btnNew = $('#btn-new');
const opacitySlider = $('#opacity-slider');
const opacityValue = $('#opacity-value');

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadAndRender();
  bindEvents();
  updatePinButton();
  updatePinDesktopButton();

  // Listen for tray menu "new note" trigger
  window.notesAPI.onTriggerNewNote(() => {
    openAddModal();
  });

  // Listen for reminder sound trigger
  window.notesAPI.onPlaySound(() => {
    playNotificationSound();
  });

  // Generate alert tray icon (with red badge) for blinking
  generateAlertIcon();
});

// ── Settings ───────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const settings = await window.notesAPI.getSettings();
    if (settings.pinned !== undefined) {
      isPinned = settings.pinned;
    }
    if (settings.pinnedToDesktop !== undefined) {
      isPinnedToDesktop = settings.pinnedToDesktop;
    }
    if (settings.opacity !== undefined) {
      opacitySlider.value = Math.round(settings.opacity * 100);
      opacityValue.textContent = Math.round(settings.opacity * 100) + '%';
    } else {
      opacityValue.textContent = opacitySlider.value + '%';
    }
  } catch (e) {
    opacityValue.textContent = opacitySlider.value + '%';
  }
}

// ── Data ───────────────────────────────────────────────────────────────────
async function loadAndRender() {
  const data = await window.notesAPI.loadNotes();
  notes = data.notes || [];
  sortNotes();
  render();
}

function sortNotes() {
  notes.sort((a, b) => {
    // Uncompleted first
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // Then by priority
    const priOrder = { high: 0, medium: 1, low: 2 };
    const pa = priOrder[a.priority] ?? 2;
    const pb = priOrder[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    // Then by date
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return 0;
  });
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  notesContainer.innerHTML = '';

  const filtered = searchQuery
    ? notes.filter((n) => {
        const q = searchQuery.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          (n.content && n.content.toLowerCase().includes(q))
        );
      })
    : notes;

  if (filtered.length === 0) {
    emptyState.style.display = '';
    if (searchQuery) {
      emptyState.querySelector('p:first-of-type').textContent = '没有匹配的便签';
      emptyState.querySelector('.empty-hint').textContent = '试试其他关键词？';
    } else {
      emptyState.querySelector('p:first-of-type').textContent = '还没有便签';
      emptyState.querySelector('.empty-hint').textContent = '点击右上角 ＋ 创建第一个便签吧';
    }
    notesContainer.appendChild(emptyState);
  } else {
    // Remove empty state if it exists in the container
    if (emptyState.parentNode === notesContainer) {
      emptyState.style.display = 'none';
    }
    filtered.forEach((note) => {
      const card = createNoteCard(note);
      notesContainer.appendChild(card);
    });
  }

  // Update status bar
  const total = notes.length;
  const pending = notes.filter((n) => !n.completed).length;
  statusText.textContent = `共 ${total} 条便签`;
  statusPending.textContent = pending > 0 ? `未完成: ${pending}` : '全部完成 ✓';
  statusPending.style.color = pending > 0 ? 'var(--warning)' : 'var(--success)';
}

function createNoteCard(note) {
  const card = document.createElement('div');
  card.className = `note-card priority-${note.priority}${note.completed ? ' completed' : ''}`;
  card.dataset.id = note.id;

  const isOverdue = !note.completed && note.date && note.time && isPastDue(note.date, note.time);

  card.innerHTML = `
    <div class="note-card-header">
      <div class="note-title-area">
        <input type="checkbox" class="note-checkbox" ${note.completed ? 'checked' : ''} title="标记完成">
        <span class="note-title">${escapeHtml(note.title)}</span>
      </div>
      <div class="note-actions">
        <button class="note-action-btn edit" title="编辑">✎</button>
        <button class="note-action-btn delete" title="删除">✕</button>
      </div>
    </div>
    ${note.content ? `<div class="note-content-preview">${escapeHtml(note.content)}</div>` : ''}
    <div class="note-meta">
      ${note.date ? `<span class="date">📅 ${note.date}${note.time ? ' ' + note.time : ''}</span>` : ''}
      ${note.reminder ? `<span class="reminder-badge ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠️ 已过期' : '🔔 已设提醒'}</span>` : ''}
      <span class="note-priority-badge ${note.priority}">${priorityText(note.priority)}</span>
    </div>
  `;

  // Checkbox — toggle complete
  card.querySelector('.note-checkbox').addEventListener('click', async (e) => {
    e.stopPropagation();
    note.completed = !note.completed;
    await window.notesAPI.updateNote(note);
    await loadAndRender();
  });

  // Edit button
  card.querySelector('.edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(note);
  });

  // Delete button
  card.querySelector('.delete').addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDelete(note);
  });

  // Click card to edit
  card.addEventListener('click', () => {
    openEditModal(note);
  });

  return card;
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openAddModal() {
  editingNoteId = null;
  modalTitle.textContent = '新建便签';
  $('#note-title').value = '';
  $('#note-content').value = '';
  $('#note-date').value = '';
  $('#note-time').value = '';
  document.querySelector('input[name="priority"][value="medium"]').checked = true;
  $('#note-reminder').checked = true;
  $('#btn-modal-save').textContent = '保存';
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('#note-title').focus(), 100);
}

function openEditModal(note) {
  editingNoteId = note.id;
  modalTitle.textContent = '编辑便签';
  $('#note-title').value = note.title || '';
  $('#note-content').value = note.content || '';
  $('#note-date').value = note.date || '';
  $('#note-time').value = note.time || '';
  const priRadio = document.querySelector(`input[name="priority"][value="${note.priority || 'medium'}"]`);
  if (priRadio) priRadio.checked = true;
  $('#note-reminder').checked = note.reminder !== false;
  $('#btn-modal-save').textContent = '更新';
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('#note-title').focus(), 100);
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingNoteId = null;
}

async function saveNote() {
  const title = $('#note-title').value.trim();
  if (!title) {
    shakeElement($('#note-title'));
    return;
  }

  const noteData = {
    title,
    content: $('#note-content').value.trim(),
    date: $('#note-date').value,
    time: $('#note-time').value,
    priority: document.querySelector('input[name="priority"]:checked')?.value || 'medium',
    reminder: $('#note-reminder').checked,
    completed: false,
  };

  if (editingNoteId) {
    noteData.id = editingNoteId;
    // Preserve created date and completion status
    const existing = notes.find((n) => n.id === editingNoteId);
    if (existing) {
      noteData.createdAt = existing.createdAt;
      noteData.completed = existing.completed;
    }
    await window.notesAPI.updateNote(noteData);
  } else {
    await window.notesAPI.saveNote(noteData);
  }

  closeModal();
  await loadAndRender();
}

// ── Delete Confirmation ────────────────────────────────────────────────────
function confirmDelete(note) {
  deleteTargetId = note.id;
  confirmNoteTitle.textContent = `"${note.title}"`;
  confirmOverlay.classList.remove('hidden');
}

function closeConfirm() {
  confirmOverlay.classList.add('hidden');
  deleteTargetId = null;
}

async function executeDelete() {
  if (deleteTargetId) {
    await window.notesAPI.deleteNote(deleteTargetId);
    deleteTargetId = null;
    closeConfirm();
    await loadAndRender();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  // Title bar buttons
  btnNew.addEventListener('click', openAddModal);
  $('#btn-min').addEventListener('click', () => window.notesAPI.minimizeWindow());
  $('#btn-close').addEventListener('click', () => window.notesAPI.hideWindow());

  btnPin.addEventListener('click', async () => {
    isPinned = !isPinned;
    if (isPinned) isPinnedToDesktop = false; // 与固定到桌面互斥
    await window.notesAPI.toggleAlwaysOnTop(isPinned);
    updatePinButton();
    updatePinDesktopButton();
  });

  btnPinDesktop.addEventListener('click', async () => {
    isPinnedToDesktop = !isPinnedToDesktop;
    if (isPinnedToDesktop) isPinned = false; // 与置顶互斥
    await window.notesAPI.togglePinToDesktop(isPinnedToDesktop);
    updatePinButton();
    updatePinDesktopButton();
  });

  // Opacity slider
  opacitySlider.addEventListener('input', async () => {
    const val = parseInt(opacitySlider.value) / 100;
    opacityValue.textContent = Math.round(val * 100) + '%';
    await window.notesAPI.setOpacity(val);
  });

  // Search
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    render();
  });

  // Modal
  $('#btn-modal-close').addEventListener('click', closeModal);
  $('#btn-modal-cancel').addEventListener('click', closeModal);
  $('#btn-modal-save').addEventListener('click', saveNote);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Confirm dialog
  $('#btn-confirm-cancel').addEventListener('click', closeConfirm);
  $('#btn-confirm-delete').addEventListener('click', executeDelete);
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) closeConfirm();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+N — new note
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      openAddModal();
    }
    // Escape — close modals
    if (e.key === 'Escape') {
      if (!modalOverlay.classList.contains('hidden')) {
        closeModal();
      } else if (!confirmOverlay.classList.contains('hidden')) {
        closeConfirm();
      }
    }
    // Enter in modal — save
    if (e.key === 'Enter' && !modalOverlay.classList.contains('hidden')) {
      const focused = document.activeElement;
      // Don't save if focused on textarea (allow multiline)
      if (focused && focused.tagName === 'TEXTAREA') return;
      e.preventDefault();
      saveNote();
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function updatePinButton() {
  if (isPinned) {
    btnPin.classList.add('pinned');
    btnPin.title = '已置顶 (点击取消)';
  } else {
    btnPin.classList.remove('pinned');
    btnPin.title = '未置顶 (点击置顶)';
  }
}

function updatePinDesktopButton() {
  if (isPinnedToDesktop) {
    btnPinDesktop.classList.add('pinned-desktop');
    btnPinDesktop.title = '已固定到桌面 (Win+D 不隐藏)';
  } else {
    btnPinDesktop.classList.remove('pinned-desktop');
    btnPinDesktop.title = '未固定 (点击固定到桌面)';
  }
}

function isPastDue(date, time) {
  if (!date || !time) return false;
  const due = new Date(`${date}T${time}:00`);
  return due.getTime() < Date.now();
}

function priorityText(priority) {
  const map = { high: '高', medium: '中', low: '低' };
  return map[priority] || '中';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function shakeElement(el) {
  el.style.borderColor = 'var(--danger)';
  el.style.animation = 'shake 0.3s ease';
  el.addEventListener('animationend', () => {
    el.style.animation = '';
    el.style.borderColor = '';
  }, { once: true });
}

// Add shake keyframe dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }
`;
document.head.appendChild(shakeStyle);

// ── Notification Sound & Alert Icon ─────────────────────────────────────────
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const freqs = [880, 1320]; // A5 → E6, a pleasant "ding"
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch (e) { /* ignore */ }
}

function generateAlertIcon() {
  const img = new Image();
  img.src = '../assets/icon.png';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const r = Math.max(img.width, img.height) * 0.28;
      const cx = img.width - r * 0.75;
      const cy = r * 0.75;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3b30';
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.15);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + Math.round(r * 1.2) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('1', cx, cy + r * 0.05);
      window.notesAPI.setAlertTrayIcon(canvas.toDataURL('image/png'));
    } catch (e) { /* ignore */ }
  };
}
