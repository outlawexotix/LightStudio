const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const net = require('net');

let mainWindow = null;

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

if (process.env.LUMINA_USER_DATA_DIR) {
  app.setPath('userData', process.env.LUMINA_USER_DATA_DIR);
} else {
  try {
    const tempUserDataDir = path.join(app.getPath('temp'), 'lumina-light-studio-user-data');
    if (!fs.existsSync(tempUserDataDir)) {
      fs.mkdirSync(tempUserDataDir, { recursive: true });
    }
    app.setPath('userData', tempUserDataDir);
  } catch (err) {
    console.error('Failed to set userData path:', err);
  }
}

function loadEnvFiles() {
  const envCandidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(app.getPath('userData'), '.env.local'),
  ];
  for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
      try {
        const content = fs.readFileSync(envFile, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      } catch (err) {
        console.error('Error reading env file:', envFile, err);
      }
    }
  }
}

function resolveDesktopAssetPath(subpath) {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-desktop', subpath);
    if (fs.existsSync(unpacked)) return unpacked;
    const packed = path.join(__dirname, '../dist-desktop', subpath);
    if (fs.existsSync(packed)) return packed;
  } else {
    const distDesktopPath = path.join(__dirname, '../dist-desktop', subpath);
    if (fs.existsSync(distDesktopPath)) return distDesktopPath;
    const distPath = path.join(__dirname, '../dist', subpath);
    if (fs.existsSync(distPath)) return distPath;
  }
  return path.join(__dirname, '../dist-desktop', subpath);
}

function checkServerRunning(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, () => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : null;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await checkServerRunning(port)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Embedded Lumina server on 127.0.0.1:${port} did not respond to /api/health within 6 seconds.`);
}

function startEmbeddedServer(port, accessToken) {
  try {
    loadEnvFiles();
    const serverPath = resolveDesktopAssetPath('server.cjs');
    const webDistPath = resolveDesktopAssetPath('web');

    if (fs.existsSync(serverPath)) {
      console.log('Starting embedded Express server from:', serverPath);
      process.env.NODE_ENV = 'production';
      process.env.HOST = '127.0.0.1';
      process.env.PORT = String(port);
      process.env.API_ACCESS_TOKEN = accessToken;
      process.env.WEB_DIST_PATH = webDistPath;
      require(serverPath);
    } else {
      console.log('Server file not found at:', serverPath);
      throw new Error(`Server binary missing at ${serverPath}`);
    }
  } catch (err) {
    console.error('Failed to start embedded server:', err);
    throw err;
  }
}

async function createWindow() {
  const isDev = !app.isPackaged;
  const port = isDev ? 3000 : await getAvailablePort();
  let accessToken = null;

  if (isDev) {
    const isServerUp = await checkServerRunning(port);
    if (!isServerUp) {
      accessToken = crypto.randomBytes(32).toString('hex');
      startEmbeddedServer(port, accessToken);
      await waitForServer(port);
    }
  } else {
    accessToken = crypto.randomBytes(32).toString('hex');
    startEmbeddedServer(port, accessToken);
    await waitForServer(port);
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    title: 'Lumina Light Studio',
    backgroundColor: '#06080d',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  const serverUrl = `http://127.0.0.1:${port}`;
  if (accessToken) {
    await session.defaultSession.cookies.set({
      url: serverUrl,
      name: 'lumina_access_token',
      value: accessToken,
      httpOnly: true,
      sameSite: 'strict',
    });
  }
  mainWindow.loadURL(serverUrl);
  mainWindow.show();
  mainWindow.focus();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const protocol = new URL(url).protocol;
    if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (err) {
    console.error('Fatal startup error:', err);
    dialog.showErrorBox(
      'Lumina Light Studio Startup Error',
      `An error occurred while launching the desktop application:\n\n${err.stack || err.message}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((err) => {
      console.error('Activate error:', err);
    });
  }
});

ipcMain.handle('save-dialog', async (event, options) => {
  if (!mainWindow) return null;
  return await dialog.showSaveDialog(mainWindow, options);
});
