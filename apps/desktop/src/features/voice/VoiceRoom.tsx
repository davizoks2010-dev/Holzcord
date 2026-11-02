import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, RemoteParticipant, Track, type Participant } from 'livekit-client'
import { supabase, type Channel } from '../../lib/supabase'
import { useSettings } from '../../lib/settings'
import { useUI } from '../../lib/store'
import Icon from '../../components/Icon'

interface Source { id: string; name: string; thumbnail: string }
const QUALITY = { '720p30': [1280, 720, 30], '1080p30': [1920, 1080, 30], '1080p60': [1920, 1080, 60] } as const
type Q = keyof typeof QUALITY
type Devs = { audioinput: MediaDeviceInfo[]; audiooutput: MediaDeviceInfo[]; videoinput: MediaDeviceInfo[] }

function Tile({ p, source, volume, onVolume }: { p: Participant; source: Track.Source; volume?: number; onVolume?: (v: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const pub = p.getTrackPublication(source)
    const el = ref.current; pub?.track?.attach(el!)
    return () => { if (el) pub?.track?.detach(el) }
  })
  const camOn = !!p.getTrackPublication(source)?.track
  return (
    <div className={`group relative overflow-hidden rounded-leaf bg-black ${p.isSpeaking ? 'ring-2 ring-holz-live' : 'border border-holz-line'}`}>
      <video ref={ref} autoPlay playsInline muted={p.isLocal} className={`h-full w-full object-contain ${camOn ? '' : 'hidden'}`} />
      {!camOn && <div className="grid h-full min-h-[8rem] place-items-center font-display text-4xl text-holz-mute">{(p.name ?? '?').slice(0, 1).toUpperCase()}</div>}
      <span className="absolute bottom-2 left-2 rounded-leafsm bg-black/60 px-2.5 py-0.5 font-mono text-xs text-white">
        {p.name}{source === Track.Source.ScreenShare ? ' (tela)' : ''}{!p.isMicrophoneEnabled && ' 🔇'}
      </span>
      {onVolume && source === Track.Source.Camera && (
        <input type="range" min={0} max={1} step={0.05} value={volume ?? 1} title="Volume desta pessoa" onChange={e => onVolume(Number(e.target.value))}
          className="absolute right-2 top-2 hidden w-24 accent-holz-500 group-hover:block" />
      )}
    </div>
  )
}

export default function VoiceRoom({ channel }: { channel: Channel }) {
  const { noiseSuppression, echoCancellation } = useSettings()
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { noiseSuppression, echoCancellation, autoGainControl: true } }))
  const [, force] = useState(0)
  const [state, setState] = useState<'connecting' | 'on' | 'error'>('connecting')
  const [err, setErr] = useState('')
  const [sources, setSources] = useState<Source[] | null>(null)
  const [deaf, setDeaf] = useState(false)
  const [vols, setVols] = useState<Record<string, number>>({})
  const [quality, setQuality] = useState<Q>('1080p30')
  const [devs, setDevs] = useState<Devs>({ audioinput: [], audiooutput: [], videoinput: [] })
  const [showCfg, setShowCfg] = useState(false)
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
        const [audioinput, audiooutput, videoinput] = await Promise.all((['audioinput', 'audiooutput', 'videoinput'] as const).map(k => Room.getLocalDevices(k).catch(() => [])))
        if (alive) setDevs({ audioinput, audiooutput, videoinput })
      } catch (e) { setErr(String((e as Error).message ?? e)); setState('error') }
    })()
    Object.values(RoomEvent).forEach(ev => room.on(ev as RoomEvent, rerender))
    // audio de quem esta na chamada precisa ser ligado a um elemento <audio>
    room.on(RoomEvent.TrackSubscribed, track => { if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach()) })
    room.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(el => el.remove()) })
    window.holz?.onScreenSources(setSources)
    window.holz?.onPushToTalk(() => room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled))
    return () => { alive = false; room.disconnect() }
  }, [room, channel.id])

  const lp = room.localParticipant
  const remotes = [...room.remoteParticipants.values()]
  const parts: Participant[] = [lp, ...remotes]

  function applyVolumes(nextDeaf: boolean, v: Record<string, number>) {
    remotes.forEach(p => (p as RemoteParticipant).setVolume(nextDeaf ? 0 : v[p.identity] ?? 1))
  }
  useEffect(() => { applyVolumes(deaf, vols) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [remotes.length, deaf, vols])

  async function toggleDeaf() {
    const next = !deaf; setDeaf(next)
    if (next) await lp.setMicrophoneEnabled(false) // ensurdecer tambem muta o microfone
  }
  const toggleScreen = () => {
    if (lp.isScreenShareEnabled) return lp.setScreenShareEnabled(false)
    const [width, height, frameRate] = QUALITY[quality]
    return lp.setScreenShareEnabled(true, { audio: true, resolution: { width, height, frameRate } }).catch(() => {})
  }
  const pick = (id: string | null) => { window.holz?.chooseScreen(id); setSources(null) }
  const leave = () => useUI.getState().setChannel(null)
  const switchDev = (kind: MediaDeviceKind, id: string) => room.switchActiveDevice(kind, id).catch(e => setErr(String(e)))

  const btn = (on: boolean) => `btn ${on ? 'bg-holz-500 text-holz-onaccent' : 'bg-holz-200 text-holz-900 border border-holz-line'}`
  const sel = 'w-full rounded-leafsm border border-holz-line bg-holz-200 p-1.5 text-sm'
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-holz-line p-4 font-display text-lg font-semibold">
        <Icon name="voice" className="text-holz-500" /> <span className="flex-1">{channel.name}</span>
        <button title="Configurações de voz" onClick={() => setShowCfg(v => !v)} className={showCfg ? 'text-holz-500' : 'text-holz-mute hover:text-holz-500'}><Icon name="gear" /></button>
      </header>
      {state === 'connecting' && <p className="p-4 font-mono text-sm text-holz-mute">conectando…</p>}
      {err && <p className="p-4 text-holz-coral">{state === 'error' ? 'Falha ao conectar: ' : ''}{err}</p>}
      {showCfg && (
        <div className="grid grid-cols-2 gap-3 border-b border-holz-line bg-holz-100 p-4 md:grid-cols-4">
          <label className="text-xs text-holz-mute">Microfone
            <select className={sel} onChange={e => switchDev('audioinput', e.target.value)}>{devs.audioinput.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microfone'}</option>)}</select></label>
          <label className="text-xs text-holz-mute">Saída de áudio
            <select className={sel} onChange={e => switchDev('audiooutput', e.target.value)}>{devs.audiooutput.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Alto-falante'}</option>)}</select></label>
          <label className="text-xs text-holz-mute">Câmera
            <select className={sel} onChange={e => switchDev('videoinput', e.target.value)}>{devs.videoinput.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Câmera'}</option>)}</select></label>
          <label className="text-xs text-holz-mute">Qualidade da transmissão
            <select className={sel} value={quality} onChange={e => setQuality(e.target.value as Q)}>{Object.keys(QUALITY).map(k => <option key={k}>{k}</option>)}</select></label>
        </div>
      )}
      <div className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 p-5">
        {parts.map(p => <Tile key={p.identity + 'cam'} p={p} source={Track.Source.Camera} volume={vols[p.identity]} onVolume={p.isLocal ? undefined : v => setVols(x => ({ ...x, [p.identity]: v }))} />)}
        {parts.filter(p => p.isScreenShareEnabled).map(p => <Tile key={p.identity + 'scr'} p={p} source={Track.Source.ScreenShare} />)}
      </div>
      <div className="flex flex-wrap justify-center gap-3 p-5">
        <button className={btn(lp.isMicrophoneEnabled)} onClick={() => lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled)}><Icon name={lp.isMicrophoneEnabled ? 'mic' : 'micoff'} />{lp.isMicrophoneEnabled ? 'Mic ligado' : 'Mic mudo'}</button>
        <button className={btn(deaf)} onClick={toggleDeaf}><Icon name="voice" />{deaf ? 'Ensurdecido' : 'Ensurdecer'}</button>
        <button className={btn(lp.isCameraEnabled)} onClick={() => lp.setCameraEnabled(!lp.isCameraEnabled)}><Icon name={lp.isCameraEnabled ? 'cam' : 'camoff'} />{lp.isCameraEnabled ? 'Câmera ligada' : 'Câmera'}</button>
        <button className={btn(lp.isScreenShareEnabled)} onClick={toggleScreen}><Icon name="screen" />{lp.isScreenShareEnabled ? 'Parar tela' : 'Compartilhar tela'}</button>
        <button className="btn border border-holz-coral text-holz-coral" onClick={leave}><Icon name="out" />Sair</button>
      </div>
      {sources && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70">
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
