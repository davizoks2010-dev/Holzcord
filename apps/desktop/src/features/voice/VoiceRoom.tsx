import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type Participant } from 'livekit-client'
import { supabase, type Channel } from '../../lib/supabase'
import Icon from '../../components/Icon'

interface Source { id: string; name: string; thumbnail: string }

function Tile({ p, source }: { p: Participant; source: Track.Source }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const pub = p.getTrackPublication(source)
    pub?.track?.attach(ref.current!)
    return () => { pub?.track?.detach(ref.current!) }
  })
  return (
    <div className={`relative overflow-hidden rounded-leaf bg-black ${p.isSpeaking ? 'ring-2 ring-holz-live' : 'border border-holz-line'}`}>
      <video ref={ref} autoPlay playsInline muted={p.isLocal} className="h-full w-full object-contain" />
      <span className="absolute bottom-2 left-2 rounded-leafsm bg-black/60 px-2.5 py-0.5 font-mono text-xs">
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

  const btn = (on: boolean) => `btn ${on ? 'bg-holz-500 text-holz-rail' : 'bg-holz-200 text-holz-900 border border-holz-line'}`
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-holz-line p-4 font-display text-lg font-semibold">
        <Icon name="voice" className="text-holz-500" /> {channel.name}
      </header>
      {state === 'connecting' && <p className="p-4 font-mono text-sm text-holz-mute">conectando…</p>}
      {state === 'error' && <p className="p-4 text-holz-coral">Falha ao conectar: {err}</p>}
      <div className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 p-5">
        {parts.map(p => <Tile key={p.identity + 'cam'} p={p} source={Track.Source.Camera} />)}
        {parts.filter(p => p.isScreenShareEnabled).map(p => <Tile key={p.identity + 'scr'} p={p} source={Track.Source.ScreenShare} />)}
      </div>
      <div className="flex justify-center gap-3 p-5">
        <button className={btn(lp.isMicrophoneEnabled)} onClick={() => lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled)}>
          <Icon name={lp.isMicrophoneEnabled ? 'mic' : 'micoff'} />{lp.isMicrophoneEnabled ? 'Mic ligado' : 'Mic mudo'}</button>
        <button className={btn(lp.isCameraEnabled)} onClick={() => lp.setCameraEnabled(!lp.isCameraEnabled)}>
          <Icon name={lp.isCameraEnabled ? 'cam' : 'camoff'} />{lp.isCameraEnabled ? 'Câmera ligada' : 'Câmera'}</button>
        <button className={btn(lp.isScreenShareEnabled)} onClick={toggleScreen}>
          <Icon name="screen" />{lp.isScreenShareEnabled ? 'Parar tela' : 'Compartilhar tela'}</button>
      </div>
      {sources && (
        <div className="fixed inset-0 grid place-items-center bg-black/70">
          <div className="max-h-[80vh] w-[760px] overflow-y-auto rounded-[30px_8px_30px_8px] border border-holz-line bg-holz-100 p-6">
            <h2 className="mb-4 font-display text-xl font-semibold">Escolha o que compartilhar</h2>
            <div className="grid grid-cols-3 gap-3">
              {sources.map(s => (
                <button key={s.id} onClick={() => pick(s.id)} className="rounded-leafsm border border-holz-line bg-holz-50 p-2 hover:border-holz-500">
                  <img src={s.thumbnail} className="w-full rounded-leafsm" /><p className="mt-1 truncate font-mono text-xs">{s.name}</p>
                </button>
              ))}
            </div>
            <button className="mt-4 text-sm text-holz-mute" onClick={() => pick(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
