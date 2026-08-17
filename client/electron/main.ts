import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { extractVideo, getVideoInfo } from './videoExtractor'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'FrameLock.AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In dev: load from Vite dev server
  // In prod: load the built index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// ── IPC Handlers ──────────────────────────────────────────────
ipcMain.handle('get-video-info', async (_event, url: string) => {
  return getVideoInfo(url)
})

ipcMain.handle('extract-video', async (_event, url: string, nFrames: number) => {
  return extractVideo(url, nFrames)
})

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
