import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'

export default function PollDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [q, setQ] = useState(''); const [opts, setOpts] = useState(['', '']); const [multi, setMulti] = useState(false); const [err, setErr] = useState('')
  const clean = opts.map(o => o.trim()).filter(Boolean)
  const field = 'w-full rounded-lg border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500'
  async function create() {
    const { error } = await supabase.rpc('create_poll', { p_channel: channelId, p_question: q, p_options: clean, p_multiple: multi })
    if (error) setErr(error.message); else onClose()
  }
  return (
    <Modal title="Nova enquete" onClose={onClose}>
      <div className="space-y-2">
        <input autoFocus value={q} maxLength={200} onChange={e => setQ(e.target.value)} placeholder="Pergunta" className={field} />
        {opts.map((o, i) => <input key={i} value={o} maxLength={80} onChange={e => setOpts(x => x.map((y, j) => j === i ? e.target.value : y))} placeholder={`Opção ${i + 1}`} className={field} />)}
        {opts.length < 10 && <button onClick={() => setOpts(o => [...o, ''])} className="text-sm text-holz-500">+ adicionar opção</button>}
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} className="accent-holz-500" /> Permitir várias respostas</label>
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 text-holz-mute">Cancelar</button>
          <button disabled={!q.trim() || clean.length < 2} onClick={create} className="btn bg-holz-500 text-holz-onaccent disabled:opacity-40">Criar</button></div>
      </div>
    </Modal>
  )
}
