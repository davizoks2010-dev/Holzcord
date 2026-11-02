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

  const [dialog, setDialog] = useState<'create' | 'join' | null>(null)
  const [value, setValue] = useState(''); const [dlgErr, setDlgErr] = useState(''); const [busy, setBusy] = useState(false)
  function openDialog(d: 'create' | 'join') { setDialog(d); setValue(''); setDlgErr('') }
  async function submitDialog(e: React.FormEvent) {
    e.preventDefault(); if (!dialog || !value.trim()) return
    setBusy(true); setDlgErr('')
    const { data, error } = dialog === 'create'
      ? await supabase.rpc('create_server', { p_name: value.trim() })
      : await supabase.rpc('join_server', { p_code: value.trim() })
    setBusy(false)
    if (error) { setDlgErr(error.message); return }
    setDialog(null); await loadServers()
    const { data: list } = await supabase.from('servers').select('id,name,invite_code').eq('id', data as string).maybeSingle()
    if (list) setServer(list as Server)
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
        <button title="Criar servidor" onClick={() => openDialog('create')} className="pebble grid h-12 w-12 place-items-center border border-dashed border-holz-live text-holz-live"><Icon name="plus" /></button>
        <button title="Entrar com convite" onClick={() => openDialog('join')} className="pebble grid h-12 w-12 place-items-center border border-dashed border-holz-mute text-holz-mute"><Icon name="join" /></button>
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
          <span className="truncate font-mono text-xs text-holz-mute">{(session.user.user_metadata?.username as string) ?? session.user.email}</span>
          <button title="Sair" onClick={() => supabase.auth.signOut()} className="text-holz-coral"><Icon name="out" size={18} /></button>
        </footer>
      </aside>
      <main className="flex-1 bg-holz-50 min-w-0">
        {!channel && (
          <div className="grid h-full place-items-center text-holz-mute">
            <div className="text-center"><img src={logo} className="mx-auto mb-4 h-20 opacity-40" />
              <p className="font-display text-xl">{servers.length ? 'Escolha um canal para começar' : 'Bem-vindo ao Holzcord'}</p>
              {!servers.length && <p className="mt-2 text-sm">Crie seu primeiro servidor no botão <b className="text-holz-live">+</b> à esquerda<br />ou entre em um com um código de convite.</p>}</div>
          </div>
        )}
        {channel?.type === 'text' && <Chat key={channel.id} channel={channel} userId={session.user.id} />}
        {channel?.type === 'voice' && <VoiceRoom key={channel.id} channel={channel} />}
      </main>
      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70" onClick={() => setDialog(null)}>
          <form onSubmit={submitDialog} onClick={e => e.stopPropagation()}
            className="w-[24rem] space-y-3 rounded-[30px_8px_30px_8px] border border-holz-line bg-holz-100 p-7">
            <h2 className="font-display text-xl font-semibold">{dialog === 'create' ? 'Criar servidor' : 'Entrar com convite'}</h2>
            <input autoFocus value={value} onChange={e => setValue(e.target.value)} maxLength={100}
              placeholder={dialog === 'create' ? 'Nome do servidor' : 'Código de convite'}
              className="w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
            {dlgErr && <p className="text-sm text-holz-coral">{dlgErr}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 text-holz-mute" onClick={() => setDialog(null)}>Cancelar</button>
              <button disabled={busy || !value.trim()} className="btn bg-holz-500 text-holz-rail disabled:opacity-50">{dialog === 'create' ? 'Criar' : 'Entrar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
