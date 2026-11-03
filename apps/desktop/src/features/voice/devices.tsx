import { useEffect, useState } from 'react'

export type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput'
export type Devices = Record<DeviceKind, MediaDeviceInfo[]>

/** Lista microfones, fones e cameras. Pede permissao uma vez para os nomes aparecerem. */
export function useMediaDevices(): Devices {
  const [devs, setDevs] = useState<Devices>({ audioinput: [], audiooutput: [], videoinput: [] })
  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md) return
    const load = async () => {
      let all = await md.enumerateDevices().catch(() => [] as MediaDeviceInfo[])
      if (all.length && !all.some(d => d.label)) {
        // sem permissao os nomes vem vazios: pede acesso e solta o stream na hora
        const s = await md.getUserMedia({ audio: true }).catch(() => null)
        s?.getTracks().forEach(t => t.stop())
        all = await md.enumerateDevices().catch(() => all)
      }
      setDevs({
        audioinput: all.filter(d => d.kind === 'audioinput'),
        audiooutput: all.filter(d => d.kind === 'audiooutput'),
        videoinput: all.filter(d => d.kind === 'videoinput')
      })
    }
    load()
    md.addEventListener('devicechange', load)
    return () => md.removeEventListener('devicechange', load)
  }, [])
  return devs
}

export function DeviceField({ label, list, value, onChange, fallback }: { label: string; list: MediaDeviceInfo[]; value: string; onChange: (id: string) => void; fallback: string }) {
  const known = !value || list.some(d => d.deviceId === value)
  return (
    <label className="block text-xs font-semibold text-holz-mute">{label}
      <select className="field mt-1 font-normal text-holz-900" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Padrão do sistema</option>
        {!known && <option value={value}>Dispositivo desconectado</option>}
        {list.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${fallback} ${i + 1}`}</option>)}
      </select>
    </label>
  )
}
