import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Category, type Channel, type Member, type Message, type Profile, type Server } from '../../lib/supabase'
import { useUI } from '../../lib/store'
import { useSettings } from '../../lib/settings'
import { mentionsUser } from '../../lib/format'
import { permsOf, positionOf } from '../../lib/permissions'
import Chat from '../chat/Chat'
import VoiceRoom from '../voice/VoiceRoom'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'
import logo from '../../assets/logo.svg'
import { useServerData } from './useServerData'
import MembersPanel from './MembersPanel'
import RolesDialog from './RolesDialog'
import ServerSettingsDialog from './ServerSettingsDialog'
import ChannelSettingsDialog from './ChannelSettingsDialog'
import CategoryDialog from './CategoryDialog'
import MemberActionsDialog from './MemberActionsDialog'
import AuditDialog from './AuditDialog'
import BansDialog from './BansDialog'
import ProfileDialog from '../settings/ProfileDialog'
import SettingsDialog from '../settings/SettingsDialog'
import NewDmDialog from '../dm/NewDmDialog'
import FriendsPanel from '../dm/FriendsPanel'
import { useDMs } from '../dm/useDMs'
import { useFriends } from '../dm/useFriends'
import { useUnread } from '../chat/useUnread'

type Dlg =
  | { kind: 'create' } | { kind: 'join' } | { kind: 'channel'; type: 'text' | 'voice' }
  | { kind: 'roles' } | { kind: 'server' } | { kind: 'profile' } | { kind: 'usersettings' } | { kind: 'newdm' }
  | { kind: 'category'; category?: Category } | { kind: 'chsettings'; channel: Channel }
  | { kind: 'member'; member: Member } | { kind: 'audit' } | { kind: 'bans' } | null

export default function Shell({ session }: { session: Session }) {
  const { server, channel, setServer, setChannel } = useUI()
  const settings = useSettings()
  const [servers, setServers] = useState<Server[]>([])
  const userId = session.user.id
  const username = (session.user.user_metadata?.username as string) ?? session.user.email ?? 'usuário'
  const [view, setView] = useState<'server' | 'dm'>('server')
  const [profile, setProfile] = useState<Profile | null>(null)
  const { channels, roles, members, categories, online, statuses } = useServerData(server, userId, username, profile?.status ?? 'online')
  const { dms, reload: reloadDMs } = useDMs(userId)
  const { friends, blocked, reload: reloadFriends } = useFriends(userId)
  const [dlg, setDlg] = useState<Dlg>(null)
  const [value, setValue] = useState(''); const [dlgErr, setDlgErr] = useState(''); const [busy, setBusy] = useState(false)

  const { unread } = useUnread(userId, [...channels.map(c => c.id), ...dms.map(d => d.channel.id)], channel?.id ?? null, async (m: Message, isOpen) => {
    const isDM = dms.some(d => d.channel.id === m.channel_id)
    if (!settings.notifications || profile?.status === 'dnd') return
    if (!(isDM || mentionsUser(m.content, username)) || (isOpen && document.hasFocus())) return
    const { data } = await supabase.from('profiles').select('username').eq('id', m.author_id).maybeSingle()
    try { if (Notification.permission !== 'denied') new Notification(`${data?.username ?? 'Alguém'} ${isDM ? 'enviou uma mensagem' : 'mencionou você'}`, { body: m.content.slice(0, 120) }) } catch { /* sem suporte */ }
  })

  const myPos = server ? positionOf(server, roles, members, userId) : 0
  const myPerms = server ? permsOf(server, roles, members, userId) : []
  const isOwner = server?.owner_id === userId

  const loadServers = useCallback(async () => {
    const { data } = await supabase.from('servers').select('id,name,invite_code,owner_id,icon_url').order('created_at')
    setServers((data as Server[]) ?? [])
  }, [])
  useEffect(() => { loadServers() }, [loadServers])
  useEffect(() => { supabase.from('profiles').select('id,username,avatar_url,about,status').eq('id', userId).maybeSingle().then(({ data }) => setProfile(data as Profile | null)) }, [userId])
  useEffect(() => { if (settings.ptt) window.holz?.setPushToTalk(settings.ptt) }, [settings.ptt])
  useEffect(() => { if (channel && channel.type !== 'dm' && server && channels.length && !channels.some(c => c.id === channel.id)) setChannel(null) }, [channels, channel, server, setChannel])
  // mantem o canal aberto atualizado (topico, modo lento...)
  useEffect(() => { if (channel && channel.type !== 'dm') { const f = channels.find(c => c.id === channel.id); if (f && JSON.stringify(f) !== JSON.stringify(channel)) setChannel(f) } }, [channels, channel, setChannel])

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
    const { data: s } = await supabase.from('servers').select('id,name,invite_code,owner_id,icon_url').eq('id', data as string).maybeSingle()
    if (s) { setView('server'); setServer(s as Server) }
  }
  async function openDM(otherId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('open_dm', { p_user: otherId })
    if (error) return error.message
    await reloadDMs()
    const { data: pr } = await supabase.from('profiles').select('username').eq('id', otherId).maybeSingle()
    setView('dm'); setChannel({ id: data as string, server_id: null, name: pr?.username ?? 'conversa', type: 'dm' })
    return null
  }
  async function openGroup(ids: string[], name: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('open_group_dm', { p_users: ids, p_name: name })
    if (error) return error.message
    await reloadDMs()
    setView('dm'); setChannel({ id: data as string, server_id: null, name: name.trim() || 'Grupo', type: 'dm', is_group: true })
    return null
  }
  async function leaveDM(id: string) {
    if (!confirm('Sair desta conversa?')) return
    const { error } = await supabase.rpc('leave_dm', { p_channel: id })
    if (error) return alert(error.message)
    if (channel?.id === id) setChannel(null)
    reloadDMs()
  }
  async function leave() {
    if (!server || !confirm(`Sair do servidor "${server.name}"?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', server.id).eq('user_id', userId)
    if (error) return alert(error.message)
    setServer(null); loadServers()
  }

  const dot = <span className="h-2 w-2 shrink-0 rounded-full bg-holz-500" />
  const canChannels = myPerms.includes('manage_channels')
  const chBtn = (c: Channel) => (
    <div key={c.id} className="group relative">
      <button onClick={() => setChannel(c)}
        className={`flex w-full items-center gap-2.5 rounded-leafsm px-3 py-2 text-left transition-colors ${channel?.id === c.id ? 'bg-holz-200 text-holz-900' : unread.has(c.id) ? 'font-semibold text-holz-900 hover:bg-holz-200/60' : 'text-holz-mute hover:bg-holz-200/60'}`}>
        <Icon name={c.type === 'voice' ? 'voice' : 'text'} size={18} className={channel?.id === c.id ? 'text-holz-500' : ''} />
        <span className="flex-1 truncate">{c.name}</span>{c.is_private && <span title="Canal privado" className="text-xs">🔒</span>}{unread.has(c.id) && dot}
      </button>
      {canChannels && <button title="Configurações do canal" onClick={() => open({ kind: 'chsettings', channel: c })} className="absolute right-2 top-2.5 hidden text-holz-mute hover:text-holz-500 group-hover:block"><Icon name="gear" size={15} /></button>}
    </div>
  )
  const header = (title: string, onAdd?: () => void, onEdit?: () => void) => (
    <div className="group mb-1 flex items-center justify-between px-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-holz-mute">{title}</span>
      <span className="flex gap-1.5">
        {onEdit && <button title="Editar categoria" onClick={onEdit} className="hidden text-holz-mute hover:text-holz-500 group-hover:block"><Icon name="gear" size={14} /></button>}
        {onAdd && <button title="Criar canal" onClick={onAdd} className="text-holz-mute hover:text-holz-500"><Icon name="plus" size={16} /></button>}
      </span>
    </div>
  )
  const free = channels.filter(c => !c.category_id)
  const typeSection = (type: 'text' | 'voice', title: string) => (
    <div className="mb-3">{header(title, canChannels ? () => open({ kind: 'channel', type }) : undefined)}{free.filter(c => c.type === type).map(chBtn)}</div>
  )

  return (
    <div className="flex h-full">
      <nav className="flex w-[76px] shrink-0 flex-col items-center gap-3 overflow-y-auto border-r border-holz-line bg-holz-rail py-3">
        <button title="Mensagens diretas e amigos" onClick={() => { setView('dm'); setChannel(null) }} className="relative">
          <img src={logo} className={`h-11 w-11 ${view === 'dm' ? '' : 'opacity-80'}`} alt="Mensagens diretas" />
          {(dms.some(d => unread.has(d.channel.id)) || friends.some(f => f.incoming && f.status === 'pending')) && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-holz-rail bg-holz-coral" />}
        </button>
        <div className="h-px w-8 bg-holz-line" />
        {servers.map(s => {
          const on = server?.id === s.id && view === 'server'
          return (
            <div key={s.id} className="relative flex w-full justify-center">
              {on && <span className="drop top-2 h-8" />}
              <button title={s.name} onClick={() => { setView('server'); setServer(s) }}
                className={`pebble h-12 w-12 overflow-hidden font-display text-lg font-semibold ${on ? 'pebble-on bg-holz-500 text-holz-onaccent' : 'bg-holz-200 text-holz-900 hover:bg-holz-line'}`}>
                {s.icon_url ? <img src={s.icon_url} className="h-full w-full object-cover" /> : s.name.slice(0, 2).toLowerCase()}
              </button>
            </div>
          )
        })}
        <button title="Criar servidor" onClick={() => open({ kind: 'create' })} className="pebble grid h-12 w-12 shrink-0 place-items-center border border-dashed border-holz-live text-holz-live"><Icon name="plus" /></button>
        <button title="Entrar com convite" onClick={() => open({ kind: 'join' })} className="pebble grid h-12 w-12 shrink-0 place-items-center border border-dashed border-holz-mute text-holz-mute"><Icon name="join" /></button>
      </nav>

      <aside className="flex w-64 shrink-0 flex-col border-r border-holz-line bg-holz-100">
        {view === 'dm' ? (
          <>
            <header className="flex items-center gap-2 border-b border-holz-line p-4">
              <span className="flex-1 truncate font-display text-lg font-semibold">Conversas</span>
              <button title="Nova conversa ou grupo" onClick={() => open({ kind: 'newdm' })} className="text-holz-mute hover:text-holz-500"><Icon name="plus" /></button>
            </header>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              <button onClick={() => setChannel(null)} className={`flex w-full items-center gap-2.5 rounded-leafsm px-3 py-2 text-left ${!channel ? 'bg-holz-200' : 'hover:bg-holz-200/60'}`}>
                <Icon name="user" size={18} className="text-holz-500" /><span className="flex-1">Amigos</span>
                {friends.some(f => f.incoming && f.status === 'pending') && <span className="rounded-full bg-holz-coral px-1.5 text-xs text-white">{friends.filter(f => f.incoming && f.status === 'pending').length}</span>}
              </button>
              <div className="h-px bg-holz-line" />
              {dms.map(d => (
                <div key={d.channel.id} className="group relative">
                  <button onClick={() => setChannel(d.channel)}
                    className={`flex w-full items-center gap-2.5 rounded-leafsm px-3 py-2 text-left ${channel?.id === d.channel.id ? 'bg-holz-200' : 'hover:bg-holz-200/60'} ${unread.has(d.channel.id) ? 'font-semibold' : 'text-holz-mute'}`}>
                    {d.isGroup ? <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-holz-line"><Icon name="user" size={14} /></span> : <Avatar name={d.other.username} url={d.other.avatar_url} size={26} />}
                    <span className="flex-1 truncate">{d.channel.name}</span>{unread.has(d.channel.id) && dot}
                  </button>
                  {d.isGroup && <button title="Sair do grupo" onClick={() => leaveDM(d.channel.id)} className="absolute right-2 top-2.5 hidden text-holz-coral group-hover:block"><Icon name="out" size={15} /></button>}
                </div>
              ))}
              {!dms.length && <p className="px-2 text-sm text-holz-mute">Nenhuma conversa ainda. Clique em + para começar.</p>}
            </div>
          </>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-holz-line p-4">
              <span className="flex-1 truncate font-display text-lg font-semibold">{server?.name ?? 'holzcord'}</span>
              {server && <button title="Cargos" onClick={() => open({ kind: 'roles' })} className="text-holz-mute hover:text-holz-500"><Icon name="leaf" /></button>}
              {server && <button title="Configurações do servidor" onClick={() => open({ kind: 'server' })} className="text-holz-mute hover:text-holz-500"><Icon name="gear" /></button>}
            </header>
            <div className="flex-1 overflow-y-auto p-3">
              {server && (
                <p className="mb-3 flex items-center gap-2 rounded-leafsm border border-dashed border-holz-line px-2 py-1.5 text-xs text-holz-mute">
                  <Icon name="link" size={14} /><code className="select-all font-mono text-holz-500">{server.invite_code}</code>
                </p>
              )}
              {server && typeSection('text', 'canais de texto')}
              {server && typeSection('voice', 'canais de voz')}
              {server && categories.map(cat => (
                <div key={cat.id} className="mb-3">
                  {header(cat.name, canChannels ? () => open({ kind: 'channel', type: 'text' }) : undefined, canChannels ? () => open({ kind: 'category', category: cat }) : undefined)}
                  {channels.filter(c => c.category_id === cat.id).map(chBtn)}
                </div>
              ))}
              {server && canChannels && <button onClick={() => open({ kind: 'category' })} className="w-full rounded-leafsm border border-dashed border-holz-line py-1.5 text-xs text-holz-mute hover:text-holz-500">+ nova categoria</button>}
            </div>
          </>
        )}
        <footer className="flex items-center gap-2 border-t border-holz-line p-3 text-sm">
          <button title="Meu perfil" onClick={() => open({ kind: 'profile' })} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-holz-500">
            <Avatar name={username} url={profile?.avatar_url} size={28} /><span className="truncate font-mono text-xs">{username}</span>
          </button>
          {view === 'server' && server && !isOwner && <button title="Sair do servidor" onClick={leave} className="text-xs text-holz-mute hover:text-holz-coral">sair</button>}
          <button title="Configurações" onClick={() => open({ kind: 'usersettings' })} className="text-holz-mute hover:text-holz-500"><Icon name="gear" size={18} /></button>
        </footer>
      </aside>

      <main className="min-w-0 flex-1 bg-holz-50">
        {!channel && view === 'dm' && <FriendsPanel friends={friends} blocked={blocked} reload={reloadFriends} onMessage={openDM} />}
        {!channel && view === 'server' && (
          <div className="grid h-full place-items-center text-holz-mute">
            <div className="text-center"><img src={logo} className="mx-auto mb-4 h-20 opacity-40" />
              <p className="font-display text-xl">{servers.length ? 'Escolha um canal para começar' : 'Bem-vindo ao Holzcord'}</p>
              {!servers.length && <p className="mt-2 text-sm">Crie seu primeiro servidor no botão <b className="text-holz-live">+</b> à esquerda<br />ou entre em um com um código de convite.</p>}</div>
          </div>
        )}
        {(channel?.type === 'text' || channel?.type === 'dm') && <Chat key={channel.id} channel={channel} userId={userId} username={username} canModerate={channel.type === 'text' && myPerms.includes('manage_messages')} />}
        {channel?.type === 'voice' && <VoiceRoom key={channel.id} channel={channel} />}
      </main>

      {view === 'server' && server && <MembersPanel server={server} roles={roles} members={members} online={online} statuses={statuses} userId={userId} myPos={myPos} myPerms={myPerms} onDM={openDM} onActions={m => open({ kind: 'member', member: m })} />}

      {dlg && (dlg.kind === 'create' || dlg.kind === 'join' || dlg.kind === 'channel') && (
        <Modal title={dlg.kind === 'create' ? 'Criar servidor' : dlg.kind === 'join' ? 'Entrar com convite' : `Novo canal de ${dlg.type === 'text' ? 'texto' : 'voz'}`} onClose={() => setDlg(null)}>
          <form onSubmit={submit} className="space-y-3">
            <input autoFocus value={value} onChange={e => setValue(e.target.value)} maxLength={100}
              placeholder={dlg.kind === 'create' ? 'Nome do servidor' : dlg.kind === 'join' ? 'Código de convite' : 'Nome do canal'}
              className="w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
            {dlg.kind === 'channel' && <div className="flex gap-2 text-sm">
              {(['text', 'voice'] as const).map(t => <button type="button" key={t} onClick={() => setDlg({ kind: 'channel', type: t })} className={`rounded-leafsm border px-3 py-1 ${dlg.type === t ? 'border-holz-500 text-holz-500' : 'border-holz-line text-holz-mute'}`}>{t === 'text' ? 'Texto' : 'Voz'}</button>)}
            </div>}
            {dlgErr && <p className="text-sm text-holz-coral">{dlgErr}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 text-holz-mute" onClick={() => setDlg(null)}>Cancelar</button>
              <button disabled={busy || !value.trim()} className="btn bg-holz-500 text-holz-onaccent disabled:opacity-50">{dlg.kind === 'join' ? 'Entrar' : 'Criar'}</button>
            </div>
          </form>
        </Modal>
      )}
      {dlg?.kind === 'newdm' && <NewDmDialog userId={userId} onOpen={openDM} onGroup={openGroup} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'profile' && profile && <ProfileDialog profile={profile} onSaved={setProfile} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'usersettings' && <SettingsDialog onClose={() => setDlg(null)} />}
      {dlg?.kind === 'server' && server && <ServerSettingsDialog server={server} canManage={myPerms.includes('manage_server')} canBan={myPerms.includes('ban_members')} canAudit={myPerms.includes('view_audit_log')} isOwner={isOwner}
        onOpen={k => open({ kind: k })} onChanged={s2 => { loadServers(); if (s2) useUI.setState({ server: s2 }) }} onDeleted={() => { setDlg(null); setServer(null); loadServers() }} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'roles' && server && <RolesDialog server={server} roles={roles} myPos={myPos} myPerms={myPerms} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'category' && server && <CategoryDialog serverId={server.id} category={dlg.category} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'chsettings' && <ChannelSettingsDialog channel={dlg.channel} categories={categories} roles={[...roles]} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'member' && server && <MemberActionsDialog server={server} member={dlg.member} myPerms={myPerms} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'audit' && server && <AuditDialog serverId={server.id} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'bans' && server && <BansDialog serverId={server.id} onClose={() => setDlg(null)} />}
    </div>
  )
}
