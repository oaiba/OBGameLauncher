const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const extract = require('extract-zip');
const Store = require('electron-store');
const { pipeline } = require('stream/promises');

// URL tới file config game của bạn
const GAME_CONFIG_URL = 'https://link-toi-file-games.json-cua-ban';

const store = new Store();

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        // THAY ĐỔI Ở ĐÂY: Chuyển sang kích thước 16:9 lớn hơn
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });
    mainWindow.setMenu(null);
    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// === IPC Handlers ===

// Lấy config game từ URL
ipcMain.handle('fetch-game-config', async () => {
    try {
        const response = await fetch(GAME_CONFIG_URL);
        if (!response.ok) throw new Error(`Failed to fetch config: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching game config:', error);
        return null;
    }
});

// Mở dialog để người dùng chọn thư mục cài đặt
ipcMain.handle('dialog:select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return filePaths[0];
});

// Lấy và set đường dẫn cài đặt từ store
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.on('store:set', (event, key, value) => store.set(key, value));

// Kiểm tra trạng thái của một game (đã cài đặt chưa, phiên bản nào)
ipcMain.handle('game:check-status', (event, gameId) => {
    const installPath = store.get('installPath');
    if (!installPath) return { status: 'no_install_path' };

    const gameDir = path.join(installPath, gameId);
    const metadataFile = path.join(gameDir, 'game-info.json');

    if (fs.existsSync(metadataFile)) {
        try {
            const metadata = JSON.parse(fs.readFileSync(metadataFile));
            return { status: 'installed', version: metadata.version, path: gameDir };
        } catch (e) {
            return { status: 'not_installed' }; // Metadata bị lỗi
        }
    }
    return { status: 'not_installed' };
});


// Tải và cài đặt game
ipcMain.on('game:install', async (event, { game, installPath }) => {
    const gameDir = path.join(installPath, game.id);
    const zipPath = path.join(app.getPath('temp'), `${game.id}.zip`);

    try {
        // Tạo thư mục nếu chưa có
        if (!fs.existsSync(gameDir)) {
            fs.mkdirSync(gameDir, { recursive: true });
        }

        // Tải file
        const response = await fetch(game.downloadUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

        const totalBytes = Number(response.headers.get('content-length'));
        let downloadedBytes = 0;

        response.body.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            const progress = (downloadedBytes / totalBytes) * 100;
            mainWindow.webContents.send('game:download-progress', { gameId: game.id, progress });
        });

        await pipeline(response.body, fs.createWriteStream(zipPath));

        // Giải nén
        await extract(zipPath, { dir: gameDir });

        // Tạo file metadata
        const metadata = { version: game.version };
        fs.writeFileSync(path.join(gameDir, 'game-info.json'), JSON.stringify(metadata));

        // Dọn dẹp file zip
        fs.unlinkSync(zipPath);

        mainWindow.webContents.send('game:install-complete', { gameId: game.id, success: true, path: gameDir });

    } catch (error) {
        console.error(`Failed to install ${game.name}:`, error);
        mainWindow.webContents.send('game:install-complete', { gameId: game.id, success: false, error: error.message });
    }
});


// Chạy game
ipcMain.on('game:launch', (event, { gamePath, executable }) => {
    const exePath = path.join(gamePath, executable);
    if (fs.existsSync(exePath)) {
        shell.openPath(exePath);
    } else {
        dialog.showErrorBox('Lỗi', `Không tìm thấy tệp thực thi: ${exePath}`);
    }
});