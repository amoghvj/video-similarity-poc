import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getVideoInfo: (url: string) =>
    ipcRenderer.invoke('get-video-info', url),

  extractVideo: (url: string, nFrames: number) =>
    ipcRenderer.invoke('extract-video', url, nFrames),
})
