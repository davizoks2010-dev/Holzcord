import { useEffect, useRef, useState } from 'react'
import { supabase, type Channel, type Message } from '../../lib/supabase'
import { mentionsUser, renderMarkdown } from '../../lib/format'
import Icon from '../../components/Icon'
import Avatar from '../../components/Avatar'

const SELECT = '*, profiles(username,avatar_url)'
const EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀']
interface Reaction { message_id: string; user_id: string; emoji: string }
interface Props { channel: Channel; userId: string; username: string; canModerate?: boolean }

export default function Chat({ channel, userId, username, canModerate = false }: Props) {
  const isDM = channel.type === 'dm'
  const canPin = isDM || canModerate
  const [msgs, setMsgs] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({})
  const [panel, setPanel] = useState<'pins' | 'search' | null>(null)
  const [pins, setPins] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Message[] | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const typingCh = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastTyping = useRef(0)

  async function loadReactions(ids: string[]) {
    if (!ids.length) return setReactions([])
    const { data } = await supabase.from('reactions').select('message_id,user_id,emoji').in('message_id', ids)
    setReactions((data as Reaction[]) ?? [])
  }

  useEffect(() => {
    supabase.from('messages').select(SELECT).eq('channel_id', channel.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { const list = ((data as Message[]) ?? []).reverse(); setMsgs(list); loadReactions(list.map(m => m.id)) })
    const sub = supabase.channel(`msgs:${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` }, async payload => {
        if (payload.eventType === 'DELETE') return setMsgs(m => m.filter(x => x.id !== (payload.old as Message).id))
        const { data } = await supabase.from('messages').select(SELECT).eq('id', (payload.new as Message).id).single()
        if (!data) return
        setMsgs(m => payload.eventType === 'INSERT' ? [...m, data as Message] : m.map(x => x.id === data.id ? (data as Message) : x))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => { setMsgs(m => { loadReactions(m.map(x => x.id)); return m }) })
      .subscribe()
    const tc = supabase.channel(`typing:${channel.id}`)
    tc.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.id !== userId) setTyping(t => ({ ...t, [payload.id]: { name: payload.name, at: Date.now() } }))
    }).subscribe()
    typingCh.current = tc
    const timer = setInterval(() => setTyping(t => Object.fromEntries(Object.entries(t).filter(([, v]) => Date.now() - v.at < 4000))), 1000)
    return () => { supabase.removeChannel(sub); supabase.removeChannel(tc); clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])
  useEffect(() => { bottom.current?.scrollIntoView() }, [msgs.length])

  function onType(v: string) {
    setText(v)
    if (v && Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now()
      typingCh.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId, name: username } })
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim(); if (!content) return
    setText(''); const reply_to = replyTo?.id ?? null; setReplyTo(null)
    await supabase.from('messages').insert({ channel_id: channel.id, author_id: userId, content, reply_to })
  }
  async function upload(file: File) {
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) return alert(error.message)
    const url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
    await supabase.from('messages').insert({ channel_id: channel.id, author_id: userId, content: file.name, attachment_url: url })
  }
  async function saveEdit() {
    const content = editText.trim()
    if (editId && content) await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editId)
    setEditId(null)
  }
  async function react(m: Message, emoji: string) {
    setPickerFor(null)
    const mine = reactions.find(r => r.message_id === m.id && r.user_id === userId && r.emoji === emoji)
    const { error } = mine
      ? await supabase.from('reactions').delete().match({ message_id: m.id, user_id: userId, emoji })
      : await supabase.from('reactions').insert({ message_id: m.id, user_id: userId, emoji })
    if (error) alert(error.message)
  }
  async function pin(m: Message) {
    const { error } = await supabase.rpc('pin_message', { p_id: m.id, p_pinned: !m.pinned })
    if (error) alert(error.message)
  }
  async function openPins() {
    setPanel(p => p === 'pins' ? null : 'pins')
    const { data } = await supabase.from('messages').select(SELECT).eq('channel_id', channel.id).eq('pinned', true).order('created_at', { ascending: false })
    setPins((data as Message[]) ?? [])
  }
  async function search(e: React.FormEvent) {
    e.preventDefault(); const q = query.trim(); if (!q) return
    const like = q.replace(/[\\%_]/g, c => '\\' + c)
    const { data } = await supabase.from('messages').select(SELECT).eq('channel_id', channel.id).ilike('content', `%${like}%`).order('created_at', { ascending: false }).limit(30)
    setResults((data as Message[]) ?? [])
  }

  const typers = Object.values(typing).map(t => t.name)
  const byId = new Map(msgs.map(m => [m.id, m]))
  const small = 'hidden text-xs group-hover:inline'

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-holz-line p-4 font-display text-lg font-semibold">
          <Icon name={isDM ? 'dm' : 'text'} className="text-holz-500" /> <span className="flex-1 truncate">{channel.name}</span>
          <button title="Mensagens fixadas" onClick={openPins} className={panel === 'pins' ? 'text-holz-500' : 'text-holz-mute hover:text-holz-500'}><Icon name="pin" /></button>
          <button title="Buscar" onClick={() => { setPanel(p => p === 'search' ? null : 'search'); setResults(null) }} className={panel === 'search' ? 'text-holz-500' : 'text-holz-mute hover:text-holz-500'}><Icon name="search" /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {msgs.map(m => {
            const mine = m.author_id === userId
            const mention = !mine && mentionsUser(m.content, username)
            const parent = m.reply_to ? byId.get(m.reply_to) : null
            const rs = reactions.filter(r => r.message_id === m.id)
            const grouped = [...new Set(rs.map(r => r.emoji))].map(e => ({ emoji: e, n: rs.filter(r => r.emoji === e).length, me: rs.some(r => r.emoji === e && r.user_id === userId) }))
            return (
              <div key={m.id} className={`group flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar name={m.profiles?.username ?? '?'} url={m.profiles?.avatar_url} size={32} />
                <div className={`relative max-w-[75%] border px-4 py-2.5 ${mention ? 'border-holz-500' : 'border-holz-line'} ${mine ? 'rounded-petalme bg-holz-200' : 'rounded-petal bg-holz-100'}`}>
                  {m.reply_to && (
                    <div className="mb-1 truncate border-l-2 border-holz-line pl-2 text-xs text-holz-mute">
                      {parent ? <><b>{parent.profiles?.username}</b> {parent.content.replace(/[*`_]/g, "").slice(0, 80)}</> : 'mensagem anterior'}
                    </div>
                  )}
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
                    <span className={`font-display font-semibold ${mine ? 'text-holz-500' : 'text-holz-live'}`}>{m.profiles?.username ?? 'usuário'}</span>
                    <span className="font-mono text-[11px] text-holz-mute">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.pinned && <Icon name="pin" size={12} className="text-holz-500" />}
                    <button className={`${small} text-holz-mute`} onClick={() => { setReplyTo(m) }}>responder</button>
                    <button className={`${small} text-holz-mute`} onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>reagir</button>
                    {canPin && <button className={`${small} text-holz-mute`} onClick={() => pin(m)}>{m.pinned ? 'desafixar' : 'fixar'}</button>}
                    {mine && !m.attachment_url && <button className={`${small} text-holz-mute`} onClick={() => { setEditId(m.id); setEditText(m.content) }}>editar</button>}
                    {(mine || canModerate) && <button className={`${small} text-holz-coral`} onClick={() => supabase.from('messages').delete().eq('id', m.id)}>apagar</button>}
                  </div>
                  {pickerFor === m.id && (
                    <div className="absolute -top-9 right-0 z-10 flex gap-1 rounded-full border border-holz-line bg-holz-100 px-2 py-1">
                      {EMOJIS.map(e => <button key={e} onClick={() => react(m, e)} className="hover:scale-125">{e}</button>)}
                    </div>
                  )}
                  {m.attachment_url
                    ? /\.(png|jpe?g|gif|webp)$/i.test(m.attachment_url)
                      ? <img src={m.attachment_url} className="mt-1 max-h-72 rounded-leafsm" />
                      : <a className="flex items-center gap-1.5 text-holz-500 underline" target="_blank" rel="noreferrer noopener" href={m.attachment_url}><Icon name="clip" size={16} />{m.content}</a>
                    : editId === m.id
                      ? <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                          className="w-full rounded-leafsm border border-holz-500 bg-holz-rail px-2 py-1 outline-none" />
                      : <div className="whitespace-pre-wrap break-words">
                          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                          {m.edited_at && <span className="ml-1 font-mono text-[10px] text-holz-mute">(editada)</span>}
                        </div>}
                  {grouped.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {grouped.map(g => (
                        <button key={g.emoji} onClick={() => react(m, g.emoji)}
                          className={`rounded-full border px-2 py-0.5 text-xs ${g.me ? 'border-holz-500 bg-holz-500/15' : 'border-holz-line'}`}>{g.emoji} {g.n}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottom} />
        </div>

        <div className="h-5 px-6 font-mono text-xs text-holz-mute">
          {typers.length > 0 && `${typers.slice(0, 3).join(', ')} ${typers.length > 1 ? 'estão digitando…' : 'está digitando…'}`}
        </div>
        {replyTo && (
          <div className="mx-4 flex items-center gap-2 rounded-t-leafsm border border-b-0 border-holz-line bg-holz-100 px-3 py-1.5 text-xs text-holz-mute">
            <Icon name="reply" size={14} /> Respondendo a <b>{replyTo.profiles?.username}</b>
            <span className="flex-1 truncate">{replyTo.content}</span>
            <button onClick={() => setReplyTo(null)}><Icon name="x" size={14} /></button>
          </div>
        )}
        <form onSubmit={send} className="flex items-center gap-2 p-4 pt-1">
          <label title="Anexar" className="pebble grid h-11 w-11 cursor-pointer place-items-center bg-holz-200 text-holz-mute hover:text-holz-500">
            <Icon name="clip" /><input type="file" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <input value={text} onChange={e => onType(e.target.value)} placeholder={isDM ? `Conversar com ${channel.name}` : `Conversar em ${channel.name}  (use @nome para mencionar)`}
            className="h-11 flex-1 rounded-leaf border border-holz-line bg-holz-100 px-4 outline-none focus:border-holz-500" />
          <button title="Enviar" className="btn h-11 bg-holz-500 text-holz-rail hover:bg-holz-600"><Icon name="send" size={18} /></button>
        </form>
      </div>

      {panel && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-holz-line bg-holz-100 p-4">
          {panel === 'search' && (
            <form onSubmit={search} className="mb-3 flex gap-2">
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar neste canal"
                className="min-w-0 flex-1 rounded-leafsm border border-holz-line bg-holz-200 px-2 py-1.5 outline-none focus:border-holz-500" />
              <button className="btn bg-holz-500 px-3 text-holz-rail"><Icon name="search" size={16} /></button>
            </form>
          )}
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-holz-mute">{panel === 'pins' ? 'mensagens fixadas' : 'resultados'}</p>
          {(panel === 'pins' ? pins : results ?? []).map(m => (
            <div key={m.id} className="mb-2 rounded-leafsm border border-holz-line bg-holz-50 p-2.5 text-sm">
              <b className="text-holz-live">{m.profiles?.username}</b>
              <span className="ml-2 font-mono text-[10px] text-holz-mute">{new Date(m.created_at).toLocaleString()}</span>
              <div className="break-words">{m.content}</div>
            </div>
          ))}
          {((panel === 'pins' && !pins.length) || (panel === 'search' && results && !results.length)) && <p className="text-sm text-holz-mute">Nada por aqui.</p>}
        </aside>
      )}
    </div>
  )
}
