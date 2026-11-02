import { useState } from 'react'
import { supabase, type Profile } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'

const STATUS = [['online', 'Online'], ['idle', 'Ausente'], ['dnd', 'Não perturbe'], ['invisible', 'Invisível']] as const

export default function ProfileDialog({ profile, onSaved, onClose }: { profile: Profile; onSaved: (p: Profile) => void; onClose: () => void }) {
  const [about, setAbout] = useState(profile.about ?? '')
  const [status, setStatus] = useState<Profile['status']>(profile.status)
  const [avatar, setAvatar] = useState(profile.avatar_url)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const field = 'w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500'

  async function pickAvatar(file: File) {
    if (file.size > 2_000_000) return setErr('A imagem deve ter até 2 MB.')
    setBusy(true); setErr('')
    const path = `avatars/${profile.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    setBusy(false)
    if (error) return setErr(error.message)
    setAvatar(supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl)
  }
  async function save() {
    setBusy(true); setErr('')
    const patch = { about: about.trim() || null, status, avatar_url: avatar }
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved({ ...profile, ...patch }); onClose()
  }
  return (
    <Modal title="Meu perfil" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <Avatar name={profile.username} url={avatar} size={64} />
          <label className="btn cursor-pointer border border-holz-line">Trocar foto
            <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && pickAvatar(e.target.files[0])} />
          </label>
        </div>
        <p className="font-display text-lg">{profile.username}</p>
        <select value={status} onChange={e => setStatus(e.target.value as Profile['status'])} className={field}>
          {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <textarea value={about} onChange={e => setAbout(e.target.value)} maxLength={190} rows={3} placeholder="Sobre mim" className={field} />
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="px-3 text-holz-mute" onClick={onClose}>Cancelar</button>
          <button disabled={busy} onClick={save} className="btn bg-holz-500 text-holz-onaccent disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </Modal>
  )
}
