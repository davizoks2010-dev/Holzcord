import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type Participant } from 'livekit-client'
import { supabase, type Channel } from '../../lib/supabase'

interface Source { id: string; name: string; thumbnail: string }

function Tile({ p, source }: { p: Participant; source: Track.Source }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const pub = p.getTrackPublication(source)
    pub?.track?.attach(ref.current!)
    return () => { pub?.track?.detach(ref.current!) }
  })
  return (
    <div className={`relative overflow-hidden rounded-lg bg-black ${p.isSpeaking ? 'ring-2 ring-sage' : ''}`}>
      <video ref={ref} autoPlay playsInline muted={p.isLocal} className="h-full w-full object-contain" />
      <span className="absolute bottom-1 left-2 rounded bg-black/60 px-2 text-sm">
        {p.name}{source === Track.Source.ScreenShare ? ' (tela)' : ''}
      </span>
    </div>
  )
}

export default function VoiceRoom({ channel }: { channel: Channel }) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }))
  const [, force] = useState(0)
  const [state, setState] = useState<'connecting' | 'on' | 'error'>('connecting')
  const [err, setErr] = useState('')
  const [sources, setSources] = useState<Source[] | null>(null)
  const rerender = () => force(n => n + 1)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', { body: { channelId: channel.id } })
        if (error) throw error
        await room.connect(data.url, data.token)
        await room.localParticipant.setMicrophoneEnabled(true)
        if (alive) setState('on')
      } catch (e) { setErr(String((e as Error).message ?? e)); setState('error') }
    })()
    Object.values(RoomEvent).forEach(ev => room.on(ev as RoomEvent, rerender))
    window.holz?.onScreenSources(setSources)
    window.holz?.onPushToTalk(() => room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled))
    return () => { alive = false; room.disconnect() }
  }, [room, channel.id])

  const lp = room.localParticipant
  const parts = [lp, ...room.remoteParticipants.values()]
  const toggleScreen = () => lp.isScreenShareEnabled
    ? lp.setScreenShareEnabled(false)
    : lp.setScreenShareEnabled(true, { audio: true, resolution: { width: 1920, height: 1080, frameRate: 30 } })
      .catch(() => {})
  function pick(id: string | null) { window.holz?.chooseScreen(id); setSources(null) }

  const btn = (on: boolean) => `rounded px-4 py-2 font-medium ${on ? 'bg-holz-500 text-white' : 'bg-holz-200'}`
  return (
    <div className="flex h-full flex-col">
      <header className="p-3 font-semibold border-b border-holz-900/15">🔊 {channel.name}</header>
      {state === 'connecting' && <p className="p-4 text-[#8A7A6A]">Conectando…</p>}
      {state === 'error' && <p className="p-4 text-coral">Falha ao conectar: {err}</p>}
      <div className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-2 p-4">
        {parts.map(p => <Tile key={p.identity + 'cam'} p={p} source={Track.Source.Camera} />)}
        {parts.filter(p => p.isScreenShareEnabled).map(p => <Tile key={p.identity + 'scr'} p={p} source={Track.Source.ScreenShare} />)}
      </div>
      <div className="flex justify-center gap-3 p-4">
        <button className={btn(lp.isMicrophoneEnabled)} onClick={() => lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled)}>
          {lp.isMicrophoneEnabled ? '🎤 Mudo' : '🔇 Ativar mic'}</button>
        <button className={btn(lp.isCameraEnabled)} onClick={() => lp.setCameraEnabled(!lp.isCameraEnabled)}>
          {lp.isCameraEnabled ? '📷 Desligar câmera' : '📷 Ligar câmera'}</button>
        <button className={btn(lp.isScreenShareEnabled)} onClick={toggleScreen}>
          {lp.isScreenShareEnabled ? '🖥 Parar tela' : '🖥 Compartilhar tela'}</button>
      </div>
      {sources && (
        <div className="fixed inset-0 grid place-items-center bg-holz-900/40">
          <div className="max-h-[80vh] w-[760px] overflow-y-auto rounded-lg bg-holz-100 p-4">
            <h2 className="mb-3 font-semibold">Escolha o que compartilhar</h2>
            <div className="grid grid-cols-3 gap-3">
              {sources.map(s => (
                <button key={s.id} onClick={() => pick(s.id)} className="rounded bg-white p-2 hover:ring-2 hover:ring-holz-500">
                  <img src={s.thumbnail} className="w-full rounded" /><p className="mt-1 truncate text-xs">{s.name}</p>
                </button>
              ))}
            </div>
            <button className="mt-3 text-sm text-[#8A7A6A]" onClick={() => pick(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
