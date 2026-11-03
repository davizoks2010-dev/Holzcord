type UpdateStatus = { state: 'dev' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'; version?: string; percent?: number; message?: string }
interface Window {
  holz?: {
    onScreenSources(cb: (s: { id: string; name: string; thumbnail: string }[]) => void): void
    chooseScreen(id: string | null): void
    setPushToTalk(acc: string | null): Promise<void>
    onPushToTalk(cb: () => void): void
    update: {
      get(): Promise<{ status: UpdateStatus; version: string }>
      check(): Promise<void>
      install(): Promise<void>
      onStatus(cb: (s: UpdateStatus) => void): void
    }
    linkPreview(url: string): Promise<{ url: string; title: string; description: string; image: string; site: string } | null>
  }
}
