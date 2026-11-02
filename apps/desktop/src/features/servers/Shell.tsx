import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Channel, type Server } from '../../lib/supabase'
import { useUI } from '../../lib/store'
import Chat from '../chat/Chat'
import VoiceRoom from '../voice/VoiceRoom'
import Icon from '../../components/Icon'
import logo from '../../assets/logo.svg'

export default function Shell({ session }: { session: Session }) {
  const { server, channel, setServer, setChannel } = useUI()
  const [servers, setServers] = useState<Server[]>([])
  const [channels, setChannels] = useState<Channel[]>([])

  const loadServers = useCallback(async () => {
    const { data } = await supabase.from('servers').select('id,name,invite_code').order('created_at')
    setServers(data ?? [])
  }, [])
  useEffect(() => { loadServers() }, [loadServers])
  useEffect(() => {
    if (!server) { setChannels([]); return }
    supabase.from('channels').select('*').eq('server_id', server.id).order('created_at')
      .then(({ data }) => { setChannels((data as Channel[]) ?? []); })
  }, [server])

  async function createServer() {
    const name = prompt('Nome do servidor'); if (!name) return
    const { error } = await supabase.rpc('create_server', { p_name: name })
    if (error) alert(error.message); else loadServers()
  }
  async function joinServer() {
    const code = prompt('Código de convite'); if (!code) return
    const { error } = await supabase.rpc('join_server', { p_code: code })
    if (error) alert(error.message); else loadServers()
  }

  return (
    <div className="flex h-full">
      <nav className="w-[76px] bg-holz-rail border-r border-holz-line flex flex-col items-center gap-3 py-3">
        <img src={logo} className="h-11 w-11" alt="Holzcord" />
        <div className="h-px w-8 bg-holz-line" />
        {servers.map(s => {
          const on = server?.id === s.id
          return (
            <div key={s.id} className="relative flex w-full justify-center">
              {on && <span className="drop h-8 top-2" />}
              <button title={s.name} onClick={() => setServer(s)}
                className={`pebble h-12 w-12 font-display text-lg font-semibold ${on ? 'pebble-on bg-holz-500 text-holz-rail' : 'bg-holz-200 text-holz-900 hover:bg-holz-line'}`}>
                {s.name.slice(0, 2).toLowerCase()}
              </button>
            </div>
          )
        })}
        <button title="Criar servidor" onClick={createServer} className="pebble grid h-12 w-12 place-items-center border border-dashed border-holz-live text-holz-live"><Icon name="plus" /></button>
        <button title="Entrar com convite" onClick={joinServer} className="pebble grid h-12 w-12 place-items-center border border-dashed border-holz-mute text-holz-mute"><Icon name="join" /></button>
      </nav>
      <aside className="w-64 bg-holz-100 flex flex-col border-r border-holz-line">
        <header className="p-4 font-display text-lg font-semibold border-b border-holz-line truncate">{server?.name ?? 'holzcord'}</header>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {server && (
            <p className="mb-3 flex items-center gap-2 rounded-leafsm border border-dashed border-holz-line px-2 py-1.5 text-xs text-holz-mute">
              <Icon name="link" size={14} /><code className="select-all font-mono text-holz-500">{server.invite_code}</code>
            </p>
          )}
          {channels.map(c => (
            <button key={c.id} onClick={() => setChannel(c)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${channel?.id === c.id ? 'rounded-leafsm bg-holz-200 text-holz-900' : 'rounded-leafsm text-holz-mute hover:bg-holz-200/60'}`}>
              <Icon name={c.type === 'text' ? 'text' : 'voice'} size={18} className={channel?.id === c.id ? 'text-holz-500' : ''} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <footer className="flex items-center justify-between border-t border-holz-line p-3 text-sm">
          <span className="truncate font-mono text-xs text-holz-mute">{session.user.email}</span>
          <button title="Sair" onClick={() => supabase.auth.signOut()} className="text-holz-coral"><Icon name="out" size={18} /></button>
        </footer>
      </aside>
      <main className="flex-1 bg-holz-50 min-w-0">
        {!channel && (
          <div className="grid h-full place-items-center text-holz-mute">
            <div className="text-center"><img src={logo} className="mx-auto mb-4 h-20 opacity-40" /><p className="font-display text-xl">Escolha um canal para começar</p></div>
          </div>
        )}
        {channel?.type === 'text' && <Chat key={channel.id} channel={channel} userId={session.user.id} />}
        {channel?.type === 'voice' && <VoiceRoom key={channel.id} channel={channel} />}
      </main>
    </div>
  )
}
