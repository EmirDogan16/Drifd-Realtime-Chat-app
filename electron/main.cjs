const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let nextServer = null;

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#202225',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  // Production: Start Next.js server
  const nextPath = path.join(process.resourcesPath, 'app', 'node_modules', 'next', 'dist', 'bin', 'next');
  const appPath = path.join(process.resourcesPath, 'app');
  
  nextServer = spawn('node', [nextPath, 'start', '-p', '3000'], {
    cwd: appPath,
    env: { ...process.env, NODE_ENV: 'production' },
    shell: true,
  });

  nextServer.stdout.on('data', (data) => {
    console.log(`[Next.js] ${data}`);
  });

  nextServer.stderr.on('data', (data) => {
    console.error(`[Next.js Error] ${data}`);
  });

  // Wait for server to start then load
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 3000);
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Kill Next.js server if running
  if (nextServer) {
    nextServer.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Cleanup Next.js server
  if (nextServer) {
    nextServer.kill();
  }
});
