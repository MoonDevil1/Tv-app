const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const PLAYLIST_URL = 'https://livetgtv.lovable.app/api/public/playlist.m3u';
ipcMain.handle('playlist:load', async () => {
  const response = await fetch(PLAYLIST_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Playlist request failed (' + response.status + ').');
  return response.text();
});
function createWindow() {
  const win = new BrowserWindow({
    width: 1180, height: 800, minWidth: 720, minHeight: 560,
    backgroundColor: '#080b12', title: 'LiveTGTV Player', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true, spellcheck: false }
  });
  if (!app.isPackaged) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
