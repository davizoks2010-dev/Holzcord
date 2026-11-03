import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, RemoteParticipant, Track, type Participant } from 'livekit-client'
import { supabase, type Channel } from '../../lib/supabase'
import { useSettings, type Settings } from '../../lib/settings'
import { useUI } from '../../lib/store'
import Icon from '../../components/Icon'
import { DeviceField, useMediaDevices, type DeviceKind } from './devices'

interface Source { id: string; name: string; thumbnail: string }
const QUALITY = { '720p30': [1280, 720, 30], '1080p30': [1920, 1080, 30], '1080p60': [1920, 1080, 60] } as const
type Q = keyof typeof QUALITY
const KEY: Record<DeviceKind, keyof Settings> = { audioinput: 'micId', audiooutput: 'outId', videoinput: 'camId' }

/** Um quadro de video. Transmissao de tela: um clique abre em tela cheia (Esc sai). */
function Tile({ p, source, volume, onVolume, big }: { p: Participant; source: Track.Source; volume?: number; onVolume?: (v: number) => void; big?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pub = p.getTrackPublication(source)
    const el = ref.current; pub?.track?.attach(el!)
    return () => { if (el) pub?.track?.detach(el) }
  })
  const isShare = source === Track.Source.ScreenShare
  const camOn = !!p.getTrackPublication(source)?.track
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else box.current?.requestFullscreen().catch(() => {})
  }
  return (
    <div ref={box} onClick={isShare ? fullscreen : undefined} title={isShare ? 'Clique para ver em tela cheia' : undefined}
      className={`group relative overflow-hidden rounded-xl bg-black [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none ${big ? 'h-full min-h-0' : ''} ${isShare ? 'cursor-zoom-in' : ''} ${p.isSpeaking ? 'ring-2 ring-holz-live' : 'border border-holz-line'}`}>
      <video ref={ref} autoPlay playsInline muted={p.isLocal} className={`h-full w-full ${isShare ? 'object-contain' : 'object-cover'} ${camOn ? '' : 'hidden'}`} />
      {!camOn && <div className="grid h-full min-h-[8rem] place-items-center text-4xl font-semibold text-holz-mute">{(p.name ?? '?').slice(0, 1).toUpperCase()}</div>}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
        {p.name}{isShare ? ' · tela' : ''}{!p.isMicrophoneEnabled && <Icon name="micoff" size={12} />}
      </span>
      {isShare && <button title="Tela cheia" onClick={e => { e.stopPropagation(); fullscreen() }} className="absolute right-2 top-2 hidden rounded-md bg-black/60 p-1.5 text-white group-hover:block"><Icon name="expand" size={16} /></button>}
      {onVolume && source === Track.Source.Camera && (
        <input type="range" min={0} max={1} step={0.05} value={volume ?? 1} title="Volume desta pessoa" onChange={e => onVolume(Number(e.target.value))}
          className="absolute right-2 top-2 hidden w-24 accent-holz-500 group-hover:block" />
      )}
    </div>
  )
}

export default function VoiceRoom({ channel, onLeave }: { channel: Channel; onLeave?: () => void }) {
  const s = useSettings()
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation, autoGainControl: true } }))
  const [, force] = useState(0)
  const [state, setState] = useState<'connecting' | 'on' | 'error'>('connecting')
  const [err, setErr] = useState('')
  const [sources, setSources] = useState<Source[] | null>(null)
  const [deaf, setDeaf] = useState(false)
  const [vols, setVols] = useState<Record<string, number>>({})
  const [quality, setQuality] = useState<Q>('1080p30')
  const [showCfg, setShowCfg] = useState(false)
  const devs = useMediaDevices()
  const rerender = () => force(n => n + 1)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', { body: { channelId: channel.id } })
        if (error) throw error
        if (!data?.url || !data?.token) throw new Error('a função de voz não respondeu. Confira se ela foi publicada no Supabase (configurar-backend.bat).')
        await room.connect(data.url, data.token)
        await room.localParticipant.setMicrophoneEnabled(true)
        // aplica os aparelhos escolhidos antes
        const st = useSettings.getState()
        if (st.micId) room.switchActiveDevice('audioinput', st.micId).catch(() => {})
        if (st.outId) room.switchActiveDevice('audiooutput', st.outId).catch(() => {})
        if (st.camId) room.switchActiveDevice('videoinput', st.camId).catch(() => {})
        if (alive) setState('on')
      } catch (e) { setErr(String((e as Error).message ?? e)); setState('error') }
    })()
    Object.values(RoomEvent).forEach(ev => room.on(ev as RoomEvent, rerender))
    // o audio de quem esta na chamada precisa tocar em um elemento <audio>
    room.on(RoomEvent.TrackSubscribed, track => { if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach()) })
    room.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(el => el.remove()) })
    window.holz?.onScreenSources(setSources)
    window.holz?.onPushToTalk(() => room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled))
    return () => { alive = false; room.disconnect() }
  }, [room, channel.id])

  const lp = room.localParticipant
  const remotes = [...room.remoteParticipants.values()]
  const parts: Participant[] = [lp, ...remotes]
  const shares = parts.filter(p => p.isScreenShareEnabled)

  useEffect(() => {
    remotes.forEach(p => (p as RemoteParticipant).setVolume(deaf ? 0 : vols[p.identity] ?? 1))
  }, [remotes.length, deaf, vols]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleDeaf() {
    const next = !deaf; setDeaf(next)
    if (next) await lp.setMicrophoneEnabled(false)
  }
  const toggleScreen = () => {
    if (lp.isScreenShareEnabled) return lp.setScreenShareEnabled(false)
    const [width, height, frameRate] = QUALITY[quality]
    return lp.setScreenShareEnabled(true, { audio: true, resolution: { width, height, frameRate } }).catch(() => {})
  }
  const pick = (id: string | null) => { window.holz?.chooseScreen(id); setSources(null) }
  const leave = () => (onLeave ? onLeave() : useUI.getState().setChannel(null))
  // troca o aparelho agora e guarda a escolha para as proximas vezes
  const choose = (kind: DeviceKind, id: string) => {
    useSettings.getState().set({ [KEY[kind]]: id } as Partial<Settings>)
    room.switchActiveDevice(kind, id || 'default').catch(e => setErr(String(e)))
  }

  const btn = (on: boolean) => `btn ${on ? 'bg-holz-500 text-holz-onaccent' : 'bg-holz-200 text-holz-900'}`
  const tiles = (p: Participant) => (
    <Tile key={p.identity + 'cam'} p={p} source={Track.Source.Camera} volume={vols[p.identity]} onVolume={p.isLocal ? undefined : v => setVols(x => ({ ...x, [p.identity]: v }))} />
  )
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-holz-line px-4">
        <Icon name="voice" className="text-holz-mute" /> <span className="flex-1 truncate font-bold">{channel.name}</span>
        <button title="Microfone, fones e câmera" onClick={() => setShowCfg(v => !v)} className={showCfg ? 'text-holz-500' : 'text-holz-mute hover:text-holz-900'}><Icon name="gear" /></button>
      </header>
      {state === 'connecting' && <p className="p-4 text-sm text-holz-mute">Entrando na chamada…</p>}
      {err && <p className="p-4 text-sm text-holz-coral">{state === 'error' ? 'Não consegui entrar na chamada: ' : ''}{err}</p>}
      {showCfg && (
        <div className="grid grid-cols-1 gap-3 border-b border-holz-line bg-holz-100 p-4 md:grid-cols-2 xl:grid-cols-4">
          <DeviceField label="Microfone" list={devs.audioinput} value={s.micId} onChange={id => choose('audioinput', id)} fallback="Microfone" />
          <DeviceField label="Fone ou alto-falante" list={devs.audiooutput} value={s.outId} onChange={id => choose('audiooutput', id)} fallback="Saída" />
          <DeviceField label="Câmera" list={devs.videoinput} value={s.camId} onChange={id => choose('videoinput', id)} fallback="Câmera" />
          <label className="block text-xs font-semibold text-holz-mute">Qualidade da tela
            <select className="field mt-1 font-normal text-holz-900" value={quality} onChange={e => setQuality(e.target.value as Q)}>{Object.keys(QUALITY).map(k => <option key={k}>{k}</option>)}</select></label>
        </div>
      )}

      {shares.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
            {shares.map(p => <Tile key={p.identity + 'scr'} big p={p} source={Track.Source.ScreenShare} />)}
          </div>
          <div className="flex h-28 shrink-0 gap-3 overflow-x-auto">
            {parts.map(p => <div key={p.identity + 'strip'} className="aspect-video h-full shrink-0">{tiles(p)}</div>)}
          </div>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-fr grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 p-4">{parts.map(tiles)}</div>
      )}

      <div className="flex flex-wrap justify-center gap-2 border-t border-holz-line bg-holz-100 p-4">
        <button className={btn(lp.isMicrophoneEnabled)} onClick={() => lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled)}><Icon name={lp.isMicrophoneEnabled ? 'mic' : 'micoff'} />{lp.isMicrophoneEnabled ? 'Microfone' : 'Mudo'}</button>
        <button className={btn(deaf)} onClick={toggleDeaf}><Icon name="voice" />{deaf ? 'Sem som' : 'Ensurdecer'}</button>
        <button className={btn(lp.isCameraEnabled)} onClick={() => lp.setCameraEnabled(!lp.isCameraEnabled)}><Icon name={lp.isCameraEnabled ? 'cam' : 'camoff'} />{lp.isCameraEnabled ? 'Câmera ligada' : 'Câmera'}</button>
        <button className={btn(lp.isScreenShareEnabled)} onClick={toggleScreen}><Icon name="screen" />{lp.isScreenShareEnabled ? 'Parar de compartilhar' : 'Compartilhar tela'}</button>
        <button className="btn border border-holz-coral text-holz-coral" onClick={leave}><Icon name="out" />Sair</button>
      </div>

      {sources && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70">
          <div className="max-h-[80vh] w-[760px] overflow-y-auto rounded-2xl border border-holz-line bg-holz-100 p-6">
            <h2 className="mb-4 text-xl font-bold">Escolha o que compartilhar</h2>
            <div className="grid grid-cols-3 gap-3">
              {sources.map(src => (
                <button key={src.id} onClick={() => pick(src.id)} className="rounded-lg border border-holz-line bg-holz-50 p-2 hover:border-holz-500">
                  <img src={src.thumbnail} className="w-full rounded-md" /><p className="mt-1 truncate text-xs">{src.name}</p>
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
