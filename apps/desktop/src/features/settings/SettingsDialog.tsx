import { supabase } from '../../lib/supabase'
import { useSettings } from '../../lib/settings'
import Modal from '../../components/Modal'

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const field = 'w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500'
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
        <div><p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-holz-mute">aparência</p>
          <select value={s.theme} onChange={e => s.set({ theme: e.target.value as typeof s.theme })} className={field}>
            <option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Seguir o sistema</option></select></div>
        <div><p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-holz-mute">notificações</p>
          <label className={row}><input type="checkbox" checked={s.notifications} onChange={e => s.set({ notifications: e.target.checked })} className="accent-holz-500" /> Avisar sobre menções e mensagens diretas</label></div>
        <div className="space-y-1.5"><p className="font-mono text-[11px] uppercase tracking-widest text-holz-mute">voz</p>
          <label className={row}><input type="checkbox" checked={s.noiseSuppression} onChange={e => s.set({ noiseSuppression: e.target.checked })} className="accent-holz-500" /> Supressão de ruído</label>
          <label className={row}><input type="checkbox" checked={s.echoCancellation} onChange={e => s.set({ echoCancellation: e.target.checked })} className="accent-holz-500" /> Cancelamento de eco</label>
          <p className="pt-1 text-xs text-holz-mute">Vale na próxima vez que você entrar em um canal de voz.</p></div>
        <div><p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-holz-mute">atalho global do microfone</p>
          <input readOnly value={s.ptt} onKeyDown={captureKey} placeholder="Clique aqui e aperte uma tecla (Backspace limpa)" className={field} />
          <p className="mt-1 text-xs text-holz-mute">Liga e desliga o microfone mesmo com o app em segundo plano.</p></div>
        <div className="flex justify-between border-t border-holz-line pt-3">
          <button onClick={() => supabase.auth.signOut()} className="text-holz-coral">Desconectar</button>
          <button onClick={onClose} className="btn bg-holz-500 text-holz-onaccent">Fechar</button>
        </div>
      </div>
    </Modal>
  )
}
