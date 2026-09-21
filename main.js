const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Config (settings) ───────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  const defaults = { opacity: 0.85, pinned: false, pinnedToDesktop: true, autoStart: false };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) };
      // 置顶 与 固定到桌面 互斥：若旧配置同时为 true，默认保留「固定到桌面」
      if (cfg.pinnedToDesktop && cfg.pinned) cfg.pinned = false;
      return cfg;
    }
  } catch (err) { console.error('Failed to load config:', err); }
  return defaults;
}

function saveConfig(config) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8'); }
  catch (err) { console.error('Failed to save config:', err); }
}

let config = loadConfig();

// ── Data Store ──────────────────────────────────────────────────────────────
const DATA_PATH = path.join(app.getPath('userData'), 'notes.json');

function loadNotes() {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) { console.error('Failed to load notes:', err); }
  return { notes: [] };
}

function saveNotes(data) {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8'); }
  catch (err) { console.error('Failed to save notes:', err); }
}

// ── Auto-Start ──────────────────────────────────────────────────────────────
const STARTUP_DIR = path.join(app.getPath('home'), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const STARTUP_SHORTCUT = path.join(STARTUP_DIR, 'StickyNotes.lnk');

function getAutoStart() {
  return fs.existsSync(STARTUP_SHORTCUT);
}

function setAutoStart(enable) {
  try {
    if (enable) {
      const targetExe = process.execPath;
      const args = app.isPackaged ? '' : __dirname;
      const workDir = app.isPackaged ? path.dirname(targetExe) : __dirname;
      const iconPath = app.isPackaged ? targetExe : path.join(__dirname, 'assets', 'icon.ico');
      createShortcutSync(STARTUP_SHORTCUT, targetExe, args, workDir, iconPath, APP_USER_MODEL_ID);
    } else {
      if (fs.existsSync(STARTUP_SHORTCUT)) fs.unlinkSync(STARTUP_SHORTCUT);
    }
    config.autoStart = enable;
    saveConfig(config);
    return true;
  } catch (err) {
    console.error('Auto-start toggle failed:', err);
    return false;
  }
}

// ── Toast Notification Shortcut (register AUMID so Windows Toast works) ─────
const START_MENU_DIR = path.join(app.getPath('home'), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const TOAST_SHORTCUT = path.join(START_MENU_DIR, '桌面便签.lnk');
const APP_USER_MODEL_ID = 'com.stickynotes.desktop';

const AUMID_CSHARP = `
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
class CShellLink {}

[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellLinkW
{
    void GetPath(System.Text.StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription(System.Text.StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory(System.Text.StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments(System.Text.StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out ushort pwHotkey);
    void SetHotkey(ushort wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation(System.Text.StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

[ComImport, Guid("0000010B-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPersistFile
{
    void GetClassID(out Guid pClassID);
    int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
}

[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore
{
    uint GetCount(out uint cProps);
    uint GetAt(uint iProp, out PROPERTYKEY pkey);
    uint GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
    uint SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
    uint Commit();
}

[StructLayout(LayoutKind.Sequential)]
struct PROPERTYKEY
{
    public Guid fmtid;
    public uint pid;
}

[StructLayout(LayoutKind.Explicit, Size = 24)]
struct PROPVARIANT
{
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr p;
}

public static class ShortcutMaker
{
    public static void Create(string lnkPath, string target, string args, string workDir, string aumid, string iconPath)
    {
        IShellLinkW link = (IShellLinkW)new CShellLink();
        link.SetPath(target);
        if (!string.IsNullOrEmpty(args)) link.SetArguments(args);
        if (!string.IsNullOrEmpty(workDir)) link.SetWorkingDirectory(workDir);
        if (!string.IsNullOrEmpty(iconPath)) link.SetIconLocation(iconPath, 0);
        link.SetDescription("StickyNotes");

        IPropertyStore store = (IPropertyStore)link;
        PROPERTYKEY key = new PROPERTYKEY();
        key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        key.pid = 5;
        PROPVARIANT pv = new PROPVARIANT();
        pv.vt = 31;
        pv.p = Marshal.StringToCoTaskMemUni(aumid);
        try
        {
            store.SetValue(ref key, ref pv);
            store.Commit();
        }
        finally
        {
            Marshal.FreeCoTaskMem(pv.p);
        }

        ((IPersistFile)link).Save(lnkPath, true);
    }
}
`;

// Shared helper: create a Windows .lnk shortcut via PowerShell + IShellLinkW.
// Writes the script as UTF-16LE (handles Unicode paths correctly) and needs no
// iconv-lite (which is NOT bundled into the packaged app.asar).
function createShortcutSync(lnkPath, target, args, workDir, iconPath, aumid) {
  const psQuote = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    '$shortcutPath = ' + psQuote(lnkPath),
    '$targetPath = ' + psQuote(target),
    '$arguments = ' + psQuote(args),
    '$workingDir = ' + psQuote(workDir),
    '$aumid = ' + psQuote(aumid),
    '$iconPath = ' + psQuote(iconPath),
    '',
    "Add-Type -TypeDefinition @'",
    AUMID_CSHARP,
    "'@",
    '',
    '[ShortcutMaker]::Create($shortcutPath, $targetPath, $arguments, $workingDir, $aumid, $iconPath)',
  ].join('\r\n');

  const psPath = path.join(app.getPath('temp'), '_shortcut_' + Date.now() + '.ps1');
  fs.writeFileSync(psPath, '﻿' + ps, 'utf16le');
  try {
    require('child_process').execFileSync('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath],
      { windowsHide: true, stdio: 'ignore' });
  } finally {
    fs.unlinkSync(psPath);
  }
}

function registerToastShortcut() {
  try {
    // Installed (NSIS) version already has this shortcut created by the installer
    if (fs.existsSync(TOAST_SHORTCUT)) return;
    if (!fs.existsSync(START_MENU_DIR)) return;

    const targetExe = process.execPath;
    const args = app.isPackaged ? '' : __dirname;
    const workDir = app.isPackaged ? path.dirname(targetExe) : __dirname;
    const iconPath = app.isPackaged ? targetExe : path.join(__dirname, 'assets', 'icon.ico');
    createShortcutSync(TOAST_SHORTCUT, targetExe, args, workDir, iconPath, APP_USER_MODEL_ID);
  } catch (err) {
    console.error('Toast shortcut registration failed:', err);
  }
}

// ── Window ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let isQuitting = false;

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 320,
    height: 400,
    minWidth: 240,
    minHeight: 320,
    x: 60,
    y: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: config.pinned,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    opacity: config.opacity,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setSkipTaskbar(false);
    // Apply desktop pin state
    if (config.pinnedToDesktop) {
      attachToDesktop();
    } else {
      mainWindow.setAlwaysOnTop(config.pinned, 'normal');
    }
  });

  // Prevent closing — hide to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('minimize', () => {
    mainWindow.setSkipTaskbar(false);
  });

  mainWindow.on('restore', () => {
    mainWindow.setSkipTaskbar(false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Desktop Pin (desktop widget: sits below normal windows) ────────────────
// 固定到桌面：把窗口 SetParent 到桌面的 WorkerW，使它成为「桌面挂件」——位于普通
// 窗口（浏览器等）之下，但 Win+D 显示桌面时仍然可见。这与「置顶」互斥。
const DESKTOP_PIN_CSHARP = `
using System;
using System.Runtime.InteropServices;

public static class DesktopPin
{
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

    [DllImport("user32.dll")]
    static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    static IntPtr workerW = IntPtr.Zero;

    static bool FindWorkerW(IntPtr top, IntPtr lParam)
    {
        IntPtr shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (shellView != IntPtr.Zero)
        {
            workerW = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
            return false;
        }
        return true;
    }

    static IntPtr GetWorkerW()
    {
        IntPtr progman = FindWindow("Progman", null);
        IntPtr result = IntPtr.Zero;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0x0000, 1000, out result);
        workerW = IntPtr.Zero;
        EnumWindows(FindWorkerW, IntPtr.Zero);
        return workerW;
    }

    public static void Attach(long hwnd)
    {
        IntPtr w = GetWorkerW();
        if (w != IntPtr.Zero) SetParent(new IntPtr(hwnd), w);
    }

    public static void Detach(long hwnd)
    {
        SetParent(new IntPtr(hwnd), IntPtr.Zero);
    }
}
`;

function getWindowHandle(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : buf.readUInt32LE(0).toString();
}

function runDesktopPinScript(win, attach) {
  const hwnd = getWindowHandle(win);
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    '$hwnd = [int64]' + psQuote(hwnd),
    '$mode = ' + psQuote(attach ? 'attach' : 'detach'),
    '',
    "Add-Type -TypeDefinition @'",
    DESKTOP_PIN_CSHARP,
    "'@",
    '',
    "if ($mode -eq 'attach') { [DesktopPin]::Attach($hwnd) } else { [DesktopPin]::Detach($hwnd) }",
  ].join('\r\n');

  const psPath = path.join(app.getPath('temp'), '_desktoppin_' + Date.now() + '.ps1');
  fs.writeFileSync(psPath, '﻿' + ps, 'utf16le');
  try {
    require('child_process').execFileSync('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath],
      { windowsHide: true, stdio: 'ignore', timeout: 15000 });
  } finally {
    try { fs.unlinkSync(psPath); } catch (_) {}
  }
}

function attachToDesktop() {
  if (!mainWindow) return;
  try {
    mainWindow.setAlwaysOnTop(false, 'normal');
    runDesktopPinScript(mainWindow, true);
  } catch (err) { console.error('Attach to desktop failed:', err); }
}

function detachFromDesktop() {
  if (!mainWindow) return;
  try {
    runDesktopPinScript(mainWindow, false);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
  } catch (err) { console.error('Detach from desktop failed:', err); }
}

function pinToDesktop(enable) {
  if (!mainWindow) return;
  if (enable) {
    config.pinnedToDesktop = true;
    config.pinned = false; // 与置顶互斥
    attachToDesktop();
  } else {
    config.pinnedToDesktop = false;
    detachFromDesktop();
    mainWindow.setAlwaysOnTop(config.pinned, 'normal');
  }
  saveConfig(config);
}

// ── Tray ────────────────────────────────────────────────────────────────────
let tray = null;

function createTray() {
  const trayIconPath = path.join(__dirname, 'assets', 'icon.png');
  trayIconNormal = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 });

  tray = new Tray(trayIconNormal);
  tray.setToolTip('StickyNotes');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏便签',
      click: () => {
        if (mainWindow && mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          showWindow();
        }
      },
    },
    {
      label: '新建便签',
      click: () => {
        showWindow();
        mainWindow.webContents.send('trigger-new-note');
      },
    },
    { type: 'separator' },
    {
      label: '开机启动',
      type: 'checkbox',
      checked: getAutoStart(),
      click: (menuItem) => {
        const ok = setAutoStart(menuItem.checked);
        if (!ok) menuItem.checked = getAutoStart();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Update checked states each time menu opens
  tray.on('right-click', () => {
    // Menu already built, we need to rebuild for dynamic state
    // For simplicity, toggle handlers update the state
  });

  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });
}

function showWindow() {
  stopTrayBlink();
  if (!mainWindow) {
    createWindow();
  }
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
}

// ── Reminder Toast & Tray Blink (QQ/WeChat style) ───────────────────────────
const TOAST_W = 300;
const TOAST_H = 120;
let toastWindow = null;
let toastTimer = null;
let trayIconNormal = null;
let trayAlertIcon = null;
let trayBlinkTimer = null;
let trayBlinkOn = false;

function getToastPosition() {
  try {
    const b = tray.getBounds();
    if (b && b.width > 0) {
      return {
        x: Math.round(b.x + b.width / 2 - TOAST_W / 2),
        y: Math.round(b.y - TOAST_H - 12),
      };
    }
  } catch (err) { /* fall through */ }
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - TOAST_W - 16,
    y: wa.y + wa.height - TOAST_H - 16,
  };
}

function createToastWindow() {
  toastWindow = new BrowserWindow({
    width: TOAST_W,
    height: TOAST_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-toast.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  toastWindow.loadFile(path.join(__dirname, 'renderer', 'toast.html'));
  toastWindow.setAlwaysOnTop(true, 'screen-saver');
  toastWindow.on('closed', () => { toastWindow = null; });
}

function showReminderToast(note) {
  const deliver = () => toastWindow.webContents.send('show-toast', note);
  if (!toastWindow || toastWindow.isDestroyed()) {
    createToastWindow();
    toastWindow.webContents.once('did-finish-load', deliver);
  } else {
    deliver();
  }
  const pos = getToastPosition();
  toastWindow.setPosition(pos.x, pos.y, false);
  toastWindow.showInactive();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (toastWindow) toastWindow.hide(); }, 6000);
}

function startTrayBlink() {
  if (trayBlinkTimer) return;
  trayBlinkOn = false;
  trayBlinkTimer = setInterval(() => {
    if (!tray) return;
    trayBlinkOn = !trayBlinkOn;
    tray.setImage(trayBlinkOn ? (trayAlertIcon || trayIconNormal) : trayIconNormal);
  }, 500);
}

function stopTrayBlink() {
  if (trayBlinkTimer) { clearInterval(trayBlinkTimer); trayBlinkTimer = null; }
  if (tray) tray.setImage(trayIconNormal);
}

// ── IPC Handlers ────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('load-notes', () => loadNotes());

  ipcMain.handle('save-note', (_event, note) => {
    const data = loadNotes();
    note.id = note.id || generateId();
    note.createdAt = note.createdAt || new Date().toISOString();
    note.updatedAt = new Date().toISOString();
    data.notes.push(note);
    saveNotes(data);
    scheduleReminderCheck();
    return { success: true, id: note.id };
  });

  ipcMain.handle('update-note', (_event, updatedNote) => {
    const data = loadNotes();
    const index = data.notes.findIndex((n) => n.id === updatedNote.id);
    if (index !== -1) {
      updatedNote.updatedAt = new Date().toISOString();
      data.notes[index] = { ...data.notes[index], ...updatedNote };
      saveNotes(data);
      scheduleReminderCheck();
      return { success: true };
    }
    return { success: false, error: 'Note not found' };
  });

  ipcMain.handle('delete-note', (_event, noteId) => {
    const data = loadNotes();
    data.notes = data.notes.filter((n) => n.id !== noteId);
    saveNotes(data);
    return { success: true };
  });

  // Settings
  ipcMain.handle('get-settings', () => {
    return { ...config, autoStart: getAutoStart() };
  });

  ipcMain.handle('set-opacity', (_event, opacity) => {
    config.opacity = opacity;
    saveConfig(config);
    if (mainWindow) mainWindow.setOpacity(opacity);
  });

  ipcMain.handle('toggle-pin-to-desktop', (_event, flag) => {
    pinToDesktop(flag);
  });

  ipcMain.handle('toggle-always-on-top', (_event, flag) => {
    if (flag) {
      if (config.pinnedToDesktop) {
        detachFromDesktop();
        config.pinnedToDesktop = false; // 与固定到桌面互斥
      }
      config.pinned = true;
      if (mainWindow) mainWindow.setAlwaysOnTop(true, 'normal');
    } else {
      config.pinned = false;
      if (mainWindow) mainWindow.setAlwaysOnTop(false, 'normal');
    }
    saveConfig(config);
  });

  ipcMain.handle('minimize-window', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.minimize();
    }
  });

  ipcMain.handle('hide-window', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(true);
      mainWindow.hide();
    }
  });

  // Alert tray icon (with red badge) provided by renderer
  ipcMain.handle('set-alert-tray-icon', (_event, dataURL) => {
    try {
      trayAlertIcon = nativeImage.createFromDataURL(dataURL).resize({ width: 16, height: 16 });
    } catch (err) { console.error('Failed to set alert tray icon:', err); }
  });

  // Toast popup clicked → open main window & stop blinking
  ipcMain.on('toast-click', () => {
    showWindow();
    stopTrayBlink();
    if (toastWindow) toastWindow.hide();
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ── Reminder System ─────────────────────────────────────────────────────────
let reminderTimer = null;
const notifiedSet = new Set();

function scheduleReminderCheck() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(checkReminders, 30_000);
}

function checkReminders() {
  const data = loadNotes();
  const now = new Date();

  for (const note of data.notes) {
    if (note.completed || !note.reminder || !note.date || !note.time) continue;

    const remindTime = new Date(`${note.date}T${note.time}:00`);
    const diffMs = remindTime.getTime() - now.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMs <= 0 && !notifiedSet.has(note.id)) {
      notifyReminder(note);
      notifiedSet.add(note.id);
    }

    if (diffMin < -30) {
      notifiedSet.delete(note.id);
    }
  }

  const existingIds = new Set(data.notes.map((n) => n.id));
  for (const id of notifiedSet) {
    if (!existingIds.has(id)) notifiedSet.delete(id);
  }
}

function notifyReminder(note) {
  // 1. Popup toast near tray (QQ/WeChat style)
  showReminderToast(note);

  // 2. Blink tray icon until acknowledged
  startTrayBlink();

  // 3. Play notification sound via renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('play-notification-sound');
  }

  // 4. Also push to Windows notification center (works when AUMID shortcut is registered)
  sendNativeNotification(note);
}

function sendNativeNotification(note) {
  if (!Notification.isSupported()) return;

  const priorityLabels = { high: '🔴 高优先级', medium: '🟡 中优先级', low: '🟢 低优先级' };
  const notification = new Notification({
    title: `📌 日程提醒: ${note.title}`,
    body: `${note.content || '无详细内容'}\n⏰ ${note.date} ${note.time}  ${priorityLabels[note.priority] || ''}`,
    urgency: note.priority === 'high' ? 'critical' : 'normal',
  });

  notification.on('click', () => { showWindow(); });
  notification.show();
}

// ── App Lifecycle ───────────────────────────────────────────────────────────
app.setAppUserModelId('com.stickynotes.desktop');

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();
  registerToastShortcut();
  scheduleReminderCheck();
  // Sync auto-start state on launch
  if (config.autoStart && !getAutoStart()) {
    setAutoStart(true);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
}
