// @ts-ignore
import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, safeStorage, Notification, nativeImage } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { AthenaDesktopNode } from '../node/desktop-node.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let desktopNode: AthenaDesktopNode | null = null;

const isDev = !app.isPackaged;
const SERVER_URL = process.env.ATHENA_SERVER_URL || 'wss://athena-brain.onrender.com';
// Derive HTTP URL from WebSocket URL for REST calls
const HTTP_SERVER_URL = SERVER_URL.replace(/^wss?:\/\//, (match) => match === 'wss://' ? 'https://' : 'http://');

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event: any, commandLine: any, workingDirectory: any) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    createWindow();
    createTray();
    registerHotkeys();

    // Attempt to load token and start node
    const token = loadToken();
    if (token) {
      startDesktopNode(token);
    }
    // Always show window so user sees the app launched
    mainWindow?.show();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: false, // Start hidden
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // Completely frameless window
    frame: false
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event: any) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
    return false;
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../ui/assets/icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    // Fall back to an empty image if icon not found so the app never crashes
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  } catch (e) {
    tray = new Tray(nativeImage.createEmpty());
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ATHENA', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Status: ' + (desktopNode ? 'Online' : 'Offline'), enabled: false, id: 'status' },
    { type: 'separator' },
    {
      label: 'Exit', click: () => {
        app.isQuitting = true;
        desktopNode?.stop();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('ATHENA');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayStatus(status: string) {
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open ATHENA', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Status: ' + status, enabled: false, id: 'status' },
      { type: 'separator' },
      {
        label: 'Exit', click: () => {
          app.isQuitting = true;
          desktopNode?.stop();
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  }
}

function registerHotkeys() {
  globalShortcut.register('CommandOrControl+Space', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function loadToken(): string | null {
  try {
    const fs = require('fs');
    const tokenPath = path.join(app.getPath('userData'), 'auth.enc');
    if (fs.existsSync(tokenPath)) {
      const encrypted = fs.readFileSync(tokenPath);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encrypted);
      }
    }
  } catch (e) {
    console.error('Failed to load token:', e);
  }
  return null;
}

function saveToken(token: string) {
  try {
    const fs = require('fs');
    const tokenPath = path.join(app.getPath('userData'), 'auth.enc');
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      fs.writeFileSync(tokenPath, encrypted);
    }
  } catch (e) {
    console.error('Failed to save token:', e);
  }
}

const NODE_AUTH_TOKEN = process.env.NODE_AUTH_TOKEN || '7565ca7fabb23c6ea95a76cea917d7cde519057b9effe99ed6325dbb9723ab1c';

function startDesktopNode(jwtToken: string) {
  if (desktopNode) {
    desktopNode.stop();
  }

  desktopNode = new AthenaDesktopNode({
    serverUrl: SERVER_URL + '/nodes',
    token: NODE_AUTH_TOKEN, // Connect to /nodes using hardware auth token, not user JWT
    onAskPermission: async (toolName, args) => {
      // We'll show a prompt in the UI
      return new Promise<boolean>((resolve) => {
        if (!mainWindow) return resolve(false);

        const requestId = Math.random().toString(36).substring(7);

        const timeout = setTimeout(() => {
          ipcMain.removeHandler(`permission-response-${requestId}`);
          resolve(false);
        }, 60000); // 60-second timeout defaults to deny

        ipcMain.once(`permission-response-${requestId}`, (event: any, approved: boolean) => {
          clearTimeout(timeout);
          resolve(approved);
        });

        mainWindow.webContents.send('permission-request', {
          requestId,
          toolName,
          summary: `Execute ${toolName}`, // Ideally we summarize args safely
        });

        // Show window if hidden so user sees the prompt
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
      });
    },
    onStatusChange: (status, message) => {
      updateTrayStatus(status);
      mainWindow?.webContents.send('node-status', { status, message });
    }
  });

  desktopNode.start();
}

ipcMain.handle('register-device', async (event: any, hash: string, name: string) => {
  try {
    const response = await fetch(`${HTTP_SERVER_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, name })
    });

    const data = await response.json();

    if (response.ok && data.token) {
      saveToken(data.token);
      startDesktopNode(data.token);
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Unknown error' };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-ws-url', () => {
  // We send a short-lived token or the real token to the renderer so it can connect to /chat
  // Wait, the user said: "never expose the decrypted credential to the React renderer"
  // So the renderer shouldn't connect directly if it requires the token. 
  // It says: "If the chat connection requires authentication, use a secure Main-process mechanism or another architecture that avoids putting long-lived credentials into renderer-visible JavaScript."
  // OK, so the Main process will manage the /chat WebSocket connection and just IPC the messages to the renderer!
  return null;
});

// Main-process managed chat WebSocket
let chatWs: any = null;

ipcMain.handle('chat-connect', () => {
  const token = loadToken();
  if (!token) return { success: false, error: 'No token' };

  if (chatWs) {
    chatWs.close();
  }

  const WebSocket = require('ws');
  chatWs = new WebSocket(`${SERVER_URL}/chat?token=${token}`);

  chatWs.on('message', (data: Buffer, isBinary: boolean) => {
    if (mainWindow) {
      if (isBinary || (data.length > 0 && data[0] !== 123)) {
        mainWindow.webContents.send('chat-audio', data);
      } else {
        mainWindow.webContents.send('chat-message', data.toString());
      }
    }
  });

  chatWs.on('error', (err: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('chat-error', err.message);
    }
  });

  return { success: true };
});

ipcMain.handle('chat-send', (event: any, message: string) => {
  if (chatWs && chatWs.readyState === 1 /* OPEN */) {
    chatWs.send(message);
    return true;
  }
  return false;
});

ipcMain.handle('chat-send-binary', (event: any, data: ArrayBuffer) => {
  if (chatWs && chatWs.readyState === 1 /* OPEN */) {
    chatWs.send(Buffer.from(data));
    return true;
  }
  return false;
});

ipcMain.handle('hide-window', () => {
  mainWindow?.hide();
});

ipcMain.handle('show-notification', (event: any, title: string, body: string) => {
  new Notification({ title, body }).show();
});

// App lifecycle
app.on('window-all-closed', () => {
  // Overridden to not quit, handled by tray
});

app.on('will-quit', (event: any) => {
  globalShortcut.unregisterAll();
  if (desktopNode) {
    desktopNode.stop();
  }
});

// Extend app object for quitting flag
declare global {
  namespace Electron {
    interface App {
      isQuitting: boolean;
    }
  }
}
app.isQuitting = false;
