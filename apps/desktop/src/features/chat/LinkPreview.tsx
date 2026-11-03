import { useEffect, useState } from 'react'

type Preview = { url: string; title: string; description: string; image: string; site: string }
const cache = new Map<string, Preview | null>()
export const firstUrl = (text: string) => text.match(/https?:\/\/[^\s<]+/)?.[0]

export default function LinkPreview({ url }: { url: string }) {
  const [p, setP] = useState<Preview | null | undefined>(cache.get(url))
  useEffect(() => {
    if (cache.has(url) || !window.holz?.linkPreview) return
    let alive = true
    window.holz.linkPreview(url).then(r => { cache.set(url, r); if (alive) setP(r) }).catch(() => cache.set(url, null))
    return () => { alive = false }
  }, [url])
  if (!p) return null
  return (
    <a href={p.url} target="_blank" rel="noreferrer noopener" className="mt-2 flex max-w-md gap-3 overflow-hidden rounded-lg border-l-4 border-holz-500 bg-holz-100 p-3 hover:bg-holz-200">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-holz-mute">{p.site}</div>
        <div className="truncate font-semibold text-holz-500">{p.title}</div>
        {p.description && <div className="line-clamp-2 text-sm text-holz-mute">{p.description}</div>}
      </div>
      {p.image && <img src={p.image} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" referrerPolicy="no-referrer" />}
    </a>
  )
}
