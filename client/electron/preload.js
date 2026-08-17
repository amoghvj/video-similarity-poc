"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    isElectron: true,
    getVideoInfo: (url) => electron_1.ipcRenderer.invoke('get-video-info', url),
    extractVideo: (url, nFrames) => electron_1.ipcRenderer.invoke('extract-video', url, nFrames),
});
