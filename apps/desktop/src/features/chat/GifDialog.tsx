import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { useSettings } from '../../lib/settings'

interface Gif { id: string; title: string; images: { fixed_height: { url: string }; fixed_height_small: { url: string } } }

export default function GifDialog({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const key = useSettings(s => s.giphyKey)
  const [q, setQ] = useState(''); const [gifs, setGifs] = useState<Gif[]>([]); const [err, setErr] = useState('')
  useEffect(() => {
    if (!key) return
    const t = setTimeout(async () => {
      try {
        const base = q.trim() ? `search?q=${encodeURIComponent(q.trim())}&` : 'trending?'
        const r = await fetch(`https://api.giphy.com/v1/gifs/${base}api_key=${encodeURIComponent(key)}&limit=24&rating=g&lang=pt`)
        const j = await r.json()
        if (!r.ok) throw new Error(j?.message ?? 'Chave inválida')
        setGifs(j.data ?? []); setErr('')
      } catch (e) { setErr(String((e as Error).message)) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, key])
  return (
    <Modal title="Escolher um GIF" onClose={onClose} wide>
      {!key ? (
        <div className="space-y-2 text-holz-mute">
          <p>Para usar GIFs, o Holzcord precisa de uma chave gratuita do Giphy.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Crie uma conta em <b className="text-holz-900">developers.giphy.com</b> e gere uma chave (API Key).</li>
            <li>Abra as Configurações do Holzcord (engrenagem, embaixo à esquerda) e cole a chave em "GIFs".</li>
          </ol>
        </div>
      ) : (
        <>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar GIFs…" className="field mb-3" />
          {err && <p className="mb-2 text-sm text-holz-coral">{err}</p>}
          <div className="grid max-h-[55vh] grid-cols-4 gap-2 overflow-y-auto">
            {gifs.map(g => (
              <button key={g.id} onClick={() => { onPick(g.images.fixed_height.url); onClose() }} className="overflow-hidden rounded-lg bg-holz-200 hover:ring-2 hover:ring-holz-500">
                <img src={g.images.fixed_height_small.url} alt={g.title} className="h-24 w-full object-cover" />
              </button>
            ))}
          </div>
          <p className="mt-2 text-right text-xs text-holz-mute">Powered by GIPHY</p>
        </>
      )}
    </Modal>
  )
}
