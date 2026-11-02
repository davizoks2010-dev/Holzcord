import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Channel, type Message, type Profile, type Server } from '../../lib/supabase'
import { mentionsUser } from '../../lib/format'
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
import ServerSettingsDialog from './ServerSettingsDialog'
import ProfileDialog from '../settings/ProfileDialog'
import NewDmDialog from '../dm/NewDmDialog'
import Avatar from '../../components/Avatar'
import { useDMs } from '../dm/useDMs'
import { useUnread } from '../chat/useUnread'

type Dlg = { kind: 'create' } | { kind: 'join' } | { kind: 'channel'; type: 'text' | 'voice' } | { kind: 'roles' } | { kind: 'settings' } | { kind: 'profile' } | { kind: 'newdm' } | null

export default function Shell({ session }: { session: Session }) {
  const { server, channel, setServer, setChannel } = useUI()
  const [servers, setServers] = useState<Server[]>([])
  const userId = session.user.id
  const username = (session.user.user_metadata?.username as string) ?? session.user.email ?? 'usuário'
  const [view, setView] = useState<'server' | 'dm'>('server')
  const [profile, setProfile] = useState<Profile | null>(null)
  const { channels, roles, members, online, statuses } = useServerData(server, userId, username, profile?.status ?? 'online')
  const { dms, reload: reloadDMs } = useDMs(userId)
  const { unread } = useUnread(userId, [...channels.map(c => c.id), ...dms.map(d => d.channel.id)], channel?.id ?? null, async (m: Message, isOpen) => {
    const isDM = dms.some(d => d.channel.id === m.channel_id)
    if (profile?.status === 'dnd') return
    if (!(isDM || mentionsUser(m.content, username)) || (isOpen && document.hasFocus())) return
    const { data } = await supabase.from('profiles').select('username').eq('id', m.author_id).maybeSingle()
    try { if (Notification.permission !== 'denied') new Notification(`${data?.username ?? 'Alguém'} ${isDM ? 'enviou uma mensagem' : 'mencionou você'}`, { body: m.content.slice(0, 120), silent: false }) } catch { /* sem suporte */ }
  })
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
  useEffect(() => { supabase.from('profiles').select('id,username,avatar_url,about,status').eq('id', userId).maybeSingle().then(({ data }) => setProfile(data as Profile | null)) }, [userId])
  // se o canal aberto foi apagado, volta para a tela inicial
  useEffect(() => { if (channel && channel.type !== 'dm' && server && channels.length && !channels.some(c => c.id === channel.id)) setChannel(null) }, [channels, channel, server, setChannel])

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

  async function openDM(otherId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('open_dm', { p_user: otherId })
    if (error) return error.message
    await reloadDMs()
    const { data: ch } = await supabase.from('channels').select('*').eq('id', data as string).maybeSingle()
    const { data: pr } = await supabase.from('profiles').select('username').eq('id', otherId).maybeSingle()
    if (ch) { setView('dm'); setChannel({ ...(ch as Channel), name: pr?.username ?? 'conversa' }) }
    return null
  }
  const dot = <span className="h-2 w-2 shrink-0 rounded-full bg-holz-500" />

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
            className={`flex w-full items-center gap-2.5 rounded-leafsm px-3 py-2 text-left transition-colors ${channel?.id === c.id ? 'bg-holz-200 text-holz-900' : unread.has(c.id) ? 'font-semibold text-holz-900 hover:bg-holz-200/60' : 'text-holz-mute hover:bg-holz-200/60'}`}>
            <Icon name={type} size={18} className={channel?.id === c.id ? 'text-holz-500' : ''} />
            <span className="flex-1 truncate">{c.name}</span>{unread.has(c.id) && dot}
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
        <button title="Mensagens diretas" onClick={() => { setView('dm'); setChannel(null) }} className="relative">
          <img src={logo} className={`h-11 w-11 ${view === 'dm' ? '' : 'opacity-80'}`} alt="Mensagens diretas" />
          {dms.some(d => unread.has(d.channel.id)) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-holz-rail bg-holz-coral" />}
        </button>
        <div className="h-px w-8 bg-holz-line" />
        {servers.map(s => {
          const on = server?.id === s.id && view === 'server'
          return (
            <div key={s.id} className="relative flex w-full justify-center">
              {on && view === 'server' && <span className="drop top-2 h-8" />}
              <button title={s.name} onClick={() => { setView('server'); setServer(s) }}
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
        {view === 'dm' ? (
          <>
            <header className="flex items-center gap-2 border-b border-holz-line p-4">
              <span className="flex-1 truncate font-display text-lg font-semibold">Mensagens diretas</span>
              <button title="Nova conversa" onClick={() => open({ kind: 'newdm' })} className="text-holz-mute hover:text-holz-500"><Icon name="plus" /></button>
            </header>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {dms.map(d => (
                <button key={d.channel.id} onClick={() => setChannel(d.channel)}
                  className={`flex w-full items-center gap-2.5 rounded-leafsm px-3 py-2 text-left ${channel?.id === d.channel.id ? 'bg-holz-200' : 'hover:bg-holz-200/60'} ${unread.has(d.channel.id) ? 'font-semibold' : 'text-holz-mute'}`}>
                  <Avatar name={d.other.username} url={d.other.avatar_url} size={26} />
                  <span className="flex-1 truncate">{d.other.username}</span>{unread.has(d.channel.id) && dot}
                </button>
              ))}
              {!dms.length && <p className="px-2 text-sm text-holz-mute">Nenhuma conversa ainda. Clique em + para começar.</p>}
            </div>
          </>
        ) : (
          <>
        <header className="flex items-center gap-2 border-b border-holz-line p-4">
          <span className="flex-1 truncate font-display text-lg font-semibold">{server?.name ?? 'holzcord'}</span>
          {server && <button title="Cargos" onClick={() => open({ kind: 'roles' })} className="text-holz-mute hover:text-holz-500"><Icon name="leaf" /></button>}
          {server && <button title="Configurações do servidor" onClick={() => open({ kind: 'settings' })} className="text-holz-mute hover:text-holz-500"><Icon name="gear" /></button>}
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
          </>
        )}
        <footer className="flex items-center gap-2 border-t border-holz-line p-3 text-sm">
          <button title="Meu perfil" onClick={() => open({ kind: 'profile' })} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-holz-500">
            <Avatar name={username} url={profile?.avatar_url} size={28} /><span className="truncate font-mono text-xs">{username}</span>
          </button>
          {view === 'server' && server && !isOwner && <button title="Sair do servidor" onClick={leave} className="text-xs text-holz-mute hover:text-holz-coral">sair</button>}
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
        {(channel?.type === 'text' || channel?.type === 'dm') && <Chat key={channel.id} channel={channel} userId={userId} username={username} canModerate={channel.type === 'text' && myPerms.includes('manage_messages')} />}
        {channel?.type === 'voice' && <VoiceRoom key={channel.id} channel={channel} />}
      </main>

      {view === 'server' && server && <MembersPanel server={server} roles={roles} members={members} online={online} statuses={statuses} userId={userId} myPos={myPos} myPerms={myPerms} onDM={openDM} />}

      {dlg && (dlg.kind === 'create' || dlg.kind === 'join' || dlg.kind === 'channel') && (
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
      {dlg?.kind === 'newdm' && <NewDmDialog userId={userId} onOpen={openDM} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'profile' && profile && <ProfileDialog profile={profile} onSaved={setProfile} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'settings' && server && <ServerSettingsDialog server={server} canManage={myPerms.includes('manage_server')} isOwner={isOwner}
        onChanged={s2 => { loadServers(); if (s2) useUI.setState({ server: s2 }) }} onDeleted={() => { setDlg(null); setServer(null); loadServers() }} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'roles' && server && <RolesDialog server={server} roles={roles} myPos={myPos} myPerms={myPerms} onClose={() => setDlg(null)} />}
    </div>
  )
}
