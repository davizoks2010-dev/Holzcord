import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Channel, type Server } from '../../lib/supabase'
import { useUI } from '../../lib/store'
import { permsOf, positionOf } from '../../lib/permissions'
import Chat from '../chat/Chat'
import VoiceRoom from '../voice/VoiceRoom'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import logo from '../../assets/logo.svg'
import { useServerData } from './useServerData'
import MembersPanel from './MembersPanel'
import RolesDialog from './RolesDialog'

type Dlg = { kind: 'create' } | { kind: 'join' } | { kind: 'channel'; type: 'text' | 'voice' } | { kind: 'roles' } | null

export default function Shell({ session }: { session: Session }) {
  const { server, channel, setServer, setChannel } = useUI()
  const [servers, setServers] = useState<Server[]>([])
  const userId = session.user.id
  const username = (session.user.user_metadata?.username as string) ?? session.user.email ?? 'usuário'
  const { channels, roles, members, online } = useServerData(server, userId, username)
  const [dlg, setDlg] = useState<Dlg>(null)
  const [value, setValue] = useState(''); const [dlgErr, setDlgErr] = useState(''); const [busy, setBusy] = useState(false)

  const myPos = server ? positionOf(server, roles, members, userId) : 0
  const myPerms = server ? permsOf(server, roles, members, userId) : []
  const isOwner = server?.owner_id === userId

  const loadServers = useCallback(async () => {
    const { data } = await supabase.from('servers').select('id,name,invite_code,owner_id').order('created_at')
    setServers((data as Server[]) ?? [])
  }, [])
  useEffect(() => { loadServers() }, [loadServers])
  // se o canal aberto foi apagado, volta para a tela inicial
  useEffect(() => { if (channel && server && channels.length && !channels.some(c => c.id === channel.id)) setChannel(null) }, [channels, channel, server, setChannel])

  function open(d: Dlg) { setDlg(d); setValue(''); setDlgErr('') }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!dlg || !value.trim()) return
    setBusy(true); setDlgErr('')
    if (dlg.kind === 'channel') {
      const name = value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 100)
      const { data, error } = await supabase.from('channels').insert({ server_id: server!.id, name: dlg.type === 'voice' ? value.trim() : name, type: dlg.type }).select().single()
      setBusy(false)
      if (error) return setDlgErr(error.message)
      setDlg(null); setChannel(data as Channel); return
    }
    const { data, error } = dlg.kind === 'create'
      ? await supabase.rpc('create_server', { p_name: value.trim() })
      : await supabase.rpc('join_server', { p_code: value.trim() })
    setBusy(false)
    if (error) return setDlgErr(error.message)
    setDlg(null); await loadServers()
    const { data: s } = await supabase.from('servers').select('id,name,invite_code,owner_id').eq('id', data as string).maybeSingle()
    if (s) setServer(s as Server)
  }
  async function deleteChannel(c: Channel) {
    if (!confirm(`Apagar o canal "${c.name}" e todas as mensagens dele?`)) return
    const { error } = await supabase.from('channels').delete().eq('id', c.id)
    if (error) alert(error.message)
  }
  async function leave() {
    if (!server || !confirm(`Sair do servidor "${server.name}"?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', server.id).eq('user_id', userId)
    if (error) return alert(error.message)
    setServer(null); loadServers()
  }

  const section = (type: 'text' | 'voice', title: string) => (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-holz-mute">{title}</span>
        {myPerms.includes('manage_channels') && (
          <button title={`Criar canal de ${type === 'text' ? 'texto' : 'voz'}`} onClick={() => open({ kind: 'channel', type })} className="text-holz-mute hover:text-holz-500"><Icon name="plus" size={16} /></button>
        )}
      </div>
      {channels.filter(c => c.type === type).map(c => (
        <div key={c.id} className="group relative">
          <button onClick={() => setChannel(c)}
            className={`flex w-full items-center gap-2.5 rounded-leafsm px-3 py-2 text-left transition-colors ${channel?.id === c.id ? 'bg-holz-200 text-holz-900' : 'text-holz-mute hover:bg-holz-200/60'}`}>
            <Icon name={type} size={18} className={channel?.id === c.id ? 'text-holz-500' : ''} />
            <span className="truncate">{c.name}</span>
          </button>
          {myPerms.includes('manage_channels') && (
            <button title="Apagar canal" onClick={() => deleteChannel(c)} className="absolute right-2 top-2.5 hidden text-holz-coral group-hover:block"><Icon name="out" size={15} /></button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="flex h-full">
      <nav className="flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-holz-line bg-holz-rail py-3">
        <img src={logo} className="h-11 w-11" alt="Holzcord" />
        <div className="h-px w-8 bg-holz-line" />
        {servers.map(s => {
          const on = server?.id === s.id
          return (
            <div key={s.id} className="relative flex w-full justify-center">
              {on && <span className="drop top-2 h-8" />}
              <button title={s.name} onClick={() => setServer(s)}
                className={`pebble h-12 w-12 font-display text-lg font-semibold ${on ? 'pebble-on bg-holz-500 text-holz-rail' : 'bg-holz-200 text-holz-900 hover:bg-holz-line'}`}>
                {s.name.slice(0, 2).toLowerCase()}
              </button>
            </div>
          )
        })}
        <button title="Criar servidor" onClick={() => open({ kind: 'create' })} className="pebble grid h-12 w-12 place-items-center border border-dashed border-holz-live text-holz-live"><Icon name="plus" /></button>
        <button title="Entrar com convite" onClick={() => open({ kind: 'join' })} className="pebble grid h-12 w-12 place-items-center border border-dashed border-holz-mute text-holz-mute"><Icon name="join" /></button>
      </nav>

      <aside className="flex w-64 shrink-0 flex-col border-r border-holz-line bg-holz-100">
        <header className="flex items-center gap-2 border-b border-holz-line p-4">
          <span className="flex-1 truncate font-display text-lg font-semibold">{server?.name ?? 'holzcord'}</span>
          {server && (myPerms.includes('manage_roles') || roles.length > 0) && (
            <button title="Cargos" onClick={() => open({ kind: 'roles' })} className="text-holz-mute hover:text-holz-500"><Icon name="leaf" /></button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {server && (
            <p className="mb-3 flex items-center gap-2 rounded-leafsm border border-dashed border-holz-line px-2 py-1.5 text-xs text-holz-mute">
              <Icon name="link" size={14} /><code className="select-all font-mono text-holz-500">{server.invite_code}</code>
            </p>
          )}
          {server && section('text', 'canais de texto')}
          {server && section('voice', 'canais de voz')}
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-holz-line p-3 text-sm">
          <span className="truncate font-mono text-xs text-holz-mute">{username}</span>
          {server && !isOwner && <button title="Sair do servidor" onClick={leave} className="text-xs text-holz-mute hover:text-holz-coral">sair do servidor</button>}
          <button title="Desconectar" onClick={() => supabase.auth.signOut()} className="text-holz-coral"><Icon name="out" size={18} /></button>
        </footer>
      </aside>

      <main className="min-w-0 flex-1 bg-holz-50">
        {!channel && (
          <div className="grid h-full place-items-center text-holz-mute">
            <div className="text-center"><img src={logo} className="mx-auto mb-4 h-20 opacity-40" />
              <p className="font-display text-xl">{servers.length ? 'Escolha um canal para começar' : 'Bem-vindo ao Holzcord'}</p>
              {!servers.length && <p className="mt-2 text-sm">Crie seu primeiro servidor no botão <b className="text-holz-live">+</b> à esquerda<br />ou entre em um com um código de convite.</p>}</div>
          </div>
        )}
        {channel?.type === 'text' && <Chat key={channel.id} channel={channel} userId={userId} canModerate={myPerms.includes('manage_messages')} />}
        {channel?.type === 'voice' && <VoiceRoom key={channel.id} channel={channel} />}
      </main>

      {server && <MembersPanel server={server} roles={roles} members={members} online={online} userId={userId} myPos={myPos} myPerms={myPerms} />}

      {dlg && dlg.kind !== 'roles' && (
        <Modal title={dlg.kind === 'create' ? 'Criar servidor' : dlg.kind === 'join' ? 'Entrar com convite' : `Novo canal de ${dlg.type === 'text' ? 'texto' : 'voz'}`} onClose={() => setDlg(null)}>
          <form onSubmit={submit} className="space-y-3">
            <input autoFocus value={value} onChange={e => setValue(e.target.value)} maxLength={100}
              placeholder={dlg.kind === 'create' ? 'Nome do servidor' : dlg.kind === 'join' ? 'Código de convite' : 'Nome do canal'}
              className="w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
            {dlgErr && <p className="text-sm text-holz-coral">{dlgErr}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 text-holz-mute" onClick={() => setDlg(null)}>Cancelar</button>
              <button disabled={busy || !value.trim()} className="btn bg-holz-500 text-holz-rail disabled:opacity-50">{dlg.kind === 'join' ? 'Entrar' : 'Criar'}</button>
            </div>
          </form>
        </Modal>
      )}
      {dlg?.kind === 'roles' && server && <RolesDialog server={server} roles={roles} myPos={myPos} myPerms={myPerms} onClose={() => setDlg(null)} />}
    </div>
  )
}
