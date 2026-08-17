export interface ElectronAPI {
  isElectron: boolean
  getVideoInfo: (url: string) => Promise<{
    title: string
    id: string
    duration: number
    streamUrl: string
    url: string
    thumbnail: string
    uploader: string
  }>
  extractVideo: (url: string, nFrames: number) => Promise<{
    metadata: {
      title: string
      id: string
      duration: number
      streamUrl: string
      url: string
      thumbnail: string
      uploader: string
    }
    frames: string[] // base64 PNG strings
  }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
