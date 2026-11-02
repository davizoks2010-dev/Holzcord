import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import type { FriendRow, Person } from './useFriends'

type Tab = 'all' | 'pending' | 'blocked' | 'add'
interface Props { friends: FriendRow[]; blocked: Person[]; reload: () => void; onMessage: (id: string) => Promise<string | null> }

export default function FriendsPanel({ friends, blocked, reload, onMessage }: Props) {
  const [tab, setTab] = useState<Tab>('all')
  const [name, setName] = useState(''); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const accepted = friends.filter(f => f.status === 'accepted')
  const pending = friends.filter(f => f.status === 'pending')

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p; if (error) alert(error.message); reload()
  }
  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return
    const { data, error } = await supabase.rpc('send_friend_request', { p_username: name.trim() })
    setMsg(error ? { ok: false, t: error.message } : { ok: true, t: data === 'accepted' ? 'Vocês agora são amigos!' : `Pedido enviado para ${name.trim()}.` })
    if (!error) setName(''); reload()
  }
  const row = (p: Person, actions: React.ReactNode, sub?: string) => (
    <div key={p.id + (sub ?? '')} className="flex items-center gap-3 rounded-leafsm border border-holz-line bg-holz-100 px-3 py-2.5">
      <Avatar name={p.username} url={p.avatar_url} size={34} />
      <div className="min-w-0 flex-1"><div className="truncate font-display font-semibold">{p.username}</div>{sub && <div className="text-xs text-holz-mute">{sub}</div>}</div>
      {actions}
    </div>
  )
  const btn = 'btn border border-holz-line px-3 py-1 text-sm'
  const tabs: [Tab, string][] = [['all', `Amigos · ${accepted.length}`], ['pending', `Pendentes · ${pending.length}`], ['blocked', `Bloqueados · ${blocked.length}`], ['add', 'Adicionar amigo']]

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-holz-line p-4">
        <Icon name="user" className="text-holz-500" /><span className="font-display text-lg font-semibold">Amigos</span>
        <div className="ml-4 flex gap-1">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-leafsm px-3 py-1.5 text-sm ${tab === k ? (k === 'add' ? 'bg-holz-500 text-holz-onaccent' : 'bg-holz-200') : 'text-holz-mute hover:bg-holz-200/60'}`}>{l}</button>
          ))}
        </div>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-5">
        {tab === 'all' && (accepted.length ? accepted.map(f => row(f.person, <>
          <button title="Mensagem" className={btn} onClick={async () => { const e = await onMessage(f.person.id); if (e) alert(e) }}><Icon name="dm" size={16} /></button>
          <button className={btn} onClick={() => run(supabase.rpc('remove_friend', { p_user: f.person.id }))}>Remover</button>
          <button className={`${btn} text-holz-coral`} onClick={() => confirm(`Bloquear ${f.person.username}?`) && run(supabase.rpc('block_user', { p_user: f.person.id }))}>Bloquear</button>
        </>)) : <p className="text-holz-mute">Você ainda não tem amigos. Use "Adicionar amigo" e digite o nome de usuário.</p>)}
        {tab === 'pending' && (pending.length ? pending.map(f => f.incoming
          ? row(f.person, <>
              <button className={`${btn} bg-holz-500 text-holz-onaccent`} onClick={() => run(supabase.rpc('respond_friend_request', { p_id: f.id, p_accept: true }))}>Aceitar</button>
              <button className={btn} onClick={() => run(supabase.rpc('respond_friend_request', { p_id: f.id, p_accept: false }))}>Recusar</button>
            </>, 'quer ser seu amigo')
          : row(f.person, <button className={btn} onClick={() => run(supabase.rpc('remove_friend', { p_user: f.person.id }))}>Cancelar</button>, 'pedido enviado')
        ) : <p className="text-holz-mute">Nenhum pedido pendente.</p>)}
        {tab === 'blocked' && (blocked.length ? blocked.map(p => row(p, <button className={btn} onClick={() => run(supabase.rpc('unblock_user', { p_user: p.id }))}>Desbloquear</button>))
          : <p className="text-holz-mute">Você não bloqueou ninguém.</p>)}
        {tab === 'add' && (
          <form onSubmit={add} className="max-w-md space-y-3">
            <p className="text-holz-mute">Digite o nome de usuário exatamente como a pessoa usa no Holzcord.</p>
            <div className="flex gap-2">
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="nome de usuário"
                className="flex-1 rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
              <button className="btn bg-holz-500 text-holz-onaccent">Enviar pedido</button>
            </div>
            {msg && <p className={`text-sm ${msg.ok ? 'text-holz-live' : 'text-holz-coral'}`}>{msg.t}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
