import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Channel, type Server } from '../../lib/supabase'
import { useUI } from '../../lib/store'
import Chat from '../chat/Chat'
import VoiceRoom from '../voice/VoiceRoom'

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
    if (!server) return setChannels([])
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
      <nav className="w-[72px] bg-holz-200 flex flex-col items-center gap-2 py-3">
        {servers.map(s => (
          <button key={s.id} title={s.name} onClick={() => setServer(s)}
            className={`h-12 w-12 rounded-2xl hover:rounded-xl font-bold transition-all ${server?.id === s.id ? 'bg-holz-500 text-white' : 'bg-holz-50'}`}>
            {s.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button title="Criar servidor" onClick={createServer} className="h-12 w-12 rounded-2xl bg-holz-50 text-emerald-700 text-2xl">+</button>
        <button title="Entrar com convite" onClick={joinServer} className="h-12 w-12 rounded-2xl bg-holz-50 text-sky-700">→</button>
      </nav>
      <aside className="w-60 bg-holz-100 flex flex-col">
        <header className="p-3 font-semibold border-b border-holz-900/15 truncate">{server?.name ?? 'Holzcord'}</header>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {server && <p className="text-xs text-[#8A7A6A] px-2 pb-2">Convite: <code className="select-all">{server.invite_code}</code></p>}
          {channels.map(c => (
            <button key={c.id} onClick={() => setChannel(c)}
              className={`w-full text-left rounded px-2 py-1 hover:bg-holz-200 ${channel?.id === c.id ? 'bg-holz-200' : 'text-[#8A7A6A]'}`}>
              {c.type === 'text' ? '#' : '🔊'} {c.name}
            </button>
          ))}
        </div>
        <footer className="p-2 text-sm flex justify-between bg-holz-200">
          <span className="truncate">{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-coral">Sair</button>
        </footer>
      </aside>
      <main className="flex-1 bg-holz-50 min-w-0">
        {!channel && <div className="h-full grid place-items-center text-[#8A7A6A]">Selecione um canal</div>}
        {channel?.type === 'text' && <Chat key={channel.id} channel={channel} userId={session.user.id} />}
        {channel?.type === 'voice' && <VoiceRoom key={channel.id} channel={channel} />}
      </main>
    </div>
  )
}
