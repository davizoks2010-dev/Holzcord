interface Window {
  holz?: {
    onScreenSources(cb: (s: { id: string; name: string; thumbnail: string }[]) => void): void
    chooseScreen(id: string | null): void
    setPushToTalk(acc: string | null): Promise<void>
    onPushToTalk(cb: () => void): void
    linkPreview(url: string): Promise<{ url: string; title: string; description: string; image: string; site: string } | null>
  }
}
