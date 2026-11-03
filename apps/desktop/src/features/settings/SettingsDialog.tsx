import { supabase } from '../../lib/supabase'
import { useSettings, type Accent } from '../../lib/settings'
import Modal from '../../components/Modal'
import { DeviceField, useMediaDevices } from '../voice/devices'
import { useUpdate } from '../../lib/update'

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const devs = useMediaDevices()
  const up = useUpdate()
  const upText = { dev: 'Atualizações automáticas funcionam no app instalado.', idle: 'Ainda não verificado.', checking: 'Procurando…', none: 'Você está com a versão mais recente.', available: `Versão ${up.status.version} encontrada.`, downloading: `Baixando… ${up.status.percent ?? 0}%`, ready: `Versão ${up.status.version} pronta para instalar.`, error: 'Não consegui verificar agora. Tente de novo mais tarde.' }[up.status.state]
  const field = 'field'
  const row = 'flex cursor-pointer items-center gap-2'
  function captureKey(e: React.KeyboardEvent) {
    e.preventDefault()
    if (e.key === 'Backspace' || e.key === 'Delete') { s.set({ ptt: '' }); window.holz?.setPushToTalk(null); return }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean)
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key.replace('Arrow', '')
    const acc = [...mods, key].join('+')
    s.set({ ptt: acc }); window.holz?.setPushToTalk(acc)
  }
  return (
    <Modal title="Configurações" onClose={onClose}>
      <div className="space-y-4">
        <div><p className="mb-1 text-xs font-semibold text-holz-mute">Tema</p>
          <select value={s.theme} onChange={e => s.set({ theme: e.target.value as typeof s.theme })} className={field}>
            <option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Seguir o sistema</option></select></div>
        <div><p className="mb-1 text-xs font-semibold text-holz-mute">Cor de destaque</p>
          <div className="flex gap-2">
            {([['terracota', '#E07A4E'], ['oceano', '#5C9CE6'], ['floresta', '#6EBA7D'], ['violeta', '#A486F0'], ['rosa', '#E878A6']] as [Accent, string][]).map(([k, c]) => (
              <button key={k} title={k} onClick={() => s.set({ accent: k })} style={{ background: c }} className={`h-8 w-8 rounded-full ${s.accent === k ? 'ring-2 ring-holz-900 ring-offset-2 ring-offset-holz-100' : ''}`} />
            ))}
          </div></div>
        <div><p className="mb-1 text-xs font-semibold text-holz-mute">GIFs</p>
          <input value={s.giphyKey} onChange={e => s.set({ giphyKey: e.target.value.trim() })} placeholder="Chave gratuita do Giphy (developers.giphy.com)" className={field} /></div>
        <div><p className="mb-1 text-xs font-semibold text-holz-mute">Notificações</p>
          <label className={row}><input type="checkbox" checked={s.notifications} onChange={e => s.set({ notifications: e.target.checked })} className="accent-holz-500" /> Avisar sobre menções e mensagens diretas</label></div>
        <div className="space-y-2"><p className="text-xs font-semibold text-holz-mute">Microfone e fones</p>
          <DeviceField label="Microfone" list={devs.audioinput} value={s.micId} onChange={id => s.set({ micId: id })} fallback="Microfone" />
          <DeviceField label="Fone ou alto-falante" list={devs.audiooutput} value={s.outId} onChange={id => s.set({ outId: id })} fallback="Saída" />
          <DeviceField label="Câmera" list={devs.videoinput} value={s.camId} onChange={id => s.set({ camId: id })} fallback="Câmera" />
          <p className="text-xs text-holz-mute">Também dá para trocar durante a chamada, pela engrenagem.</p></div>
        <div className="space-y-1.5"><p className="text-xs font-semibold text-holz-mute">Voz</p>
          <label className={row}><input type="checkbox" checked={s.noiseSuppression} onChange={e => s.set({ noiseSuppression: e.target.checked })} className="accent-holz-500" /> Supressão de ruído</label>
          <label className={row}><input type="checkbox" checked={s.echoCancellation} onChange={e => s.set({ echoCancellation: e.target.checked })} className="accent-holz-500" /> Cancelamento de eco</label>
          <p className="pt-1 text-xs text-holz-mute">Vale na próxima vez que você entrar em um canal de voz.</p></div>
        <div><p className="mb-1 text-xs font-semibold text-holz-mute">Atalho do microfone</p>
          <input readOnly value={s.ptt} onKeyDown={captureKey} placeholder="Clique aqui e aperte uma tecla (Backspace limpa)" className={field} />
          <p className="mt-1 text-xs text-holz-mute">Liga e desliga o microfone mesmo com o app em segundo plano.</p></div>
        <div><p className="mb-1 text-xs font-semibold text-holz-mute">Atualizações</p>
          <div className="flex items-center gap-3 rounded-lg border border-holz-line p-3">
            <div className="flex-1 text-sm"><div className="font-semibold">Versão {up.version || '—'}</div><div className="text-holz-mute">{upText}</div></div>
            {up.status.state === 'ready' ? <button onClick={up.install} className="btn bg-holz-500 text-holz-onaccent">Reiniciar e atualizar</button>
              : <button onClick={up.check} disabled={up.status.state === 'dev' || up.status.state === 'checking' || up.status.state === 'downloading'} className="btn border border-holz-line disabled:opacity-40">Procurar agora</button>}
          </div></div>
        <div className="flex justify-between border-t border-holz-line pt-3">
          <button onClick={() => supabase.auth.signOut()} className="text-holz-coral">Desconectar</button>
          <button onClick={onClose} className="btn bg-holz-500 text-holz-onaccent">Fechar</button>
        </div>
      </div>
    </Modal>
  )
}
