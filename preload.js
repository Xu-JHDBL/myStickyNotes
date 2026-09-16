const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesAPI', {
  // Load all notes from storage
  loadNotes: () => ipcRenderer.invoke('load-notes'),

  // Save a new note
  saveNote: (note) => ipcRenderer.invoke('save-note', note),

  // Update an existing note
  updateNote: (note) => ipcRenderer.invoke('update-note', note),

  // Delete a note by ID
  deleteNote: (noteId) => ipcRenderer.invoke('delete-note', noteId),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // Window controls
  setOpacity: (value) => ipcRenderer.invoke('set-opacity', value),
  togglePinToDesktop: (flag) => ipcRenderer.invoke('toggle-pin-to-desktop', flag),
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('toggle-always-on-top', flag),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),

  // Listen for trigger-new-note from tray menu
  onTriggerNewNote: (callback) => {
    ipcRenderer.on('trigger-new-note', () => callback());
  },

  // Listen for reminder sound trigger
  onPlaySound: (callback) => {
    ipcRenderer.on('play-notification-sound', () => callback());
  },

  // Send alert tray icon (with red badge) back to main process
  setAlertTrayIcon: (dataURL) => ipcRenderer.invoke('set-alert-tray-icon', dataURL),
});
