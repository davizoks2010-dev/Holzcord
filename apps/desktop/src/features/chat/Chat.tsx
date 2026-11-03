import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase, type Channel, type Message } from '../../lib/supabase'
import { mentionsUser, renderMarkdown } from '../../lib/format'
import { clock, dayLabel, groupsWith, isSameDay } from '../../lib/time'
import { notify } from '../../lib/toast'
import Icon from '../../components/Icon'
import Avatar from '../../components/Avatar'
import PollDialog from './PollDialog'
import GifDialog from './GifDialog'
import ForwardDialog from './ForwardDialog'
import LinkPreview, { firstUrl } from './LinkPreview'

const SELECT = '*, profiles(username,avatar_url)'
const EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀']
const PICKER = ['😀', '😂', '🥹', '😍', '😎', '🤔', '😮', '😢', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '🔥', '❤️', '💔', '✨', '👀', '🚀', '🍕', '☕', '🎮', '🎵', '⭐', '✅', '❌', '💯', '🤝']
const IMG = /\.(png|jpe?g|gif|webp)(\?|$)/i
interface Reaction { message_id: string; user_id: string; emoji: string }
interface Poll { message_id: string; question: string; options: string[]; multiple: boolean }
interface Vote { message_id: string; user_id: string; option_idx: number }
interface Props { channel: Channel; userId: string; username: string; canModerate?: boolean; nameColor?: (uid: string) => string | undefined; onCall?: () => void; inThread?: boolean; onClose?: () => void }

export default function Chat({ channel, userId, username, canModerate = false, nameColor, onCall, inThread = false, onClose }: Props) {
  const isDM = channel.type === 'dm'
  const canPin = !inThread && (isDM || canModerate)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [polls, setPolls] = useState<Record<string, Poll>>({})
  const [votes, setVotes] = useState<Vote[]>([])
  const [threads, setThreads] = useState<Record<string, Channel>>({})
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({})
  const [panel, setPanel] = useState<'pins' | 'search' | 'thread' | null>(null)
  const [thread, setThread] = useState<Channel | null>(null)
  const [pins, setPins] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Message[] | null>(null)
  const [dialog, setDialog] = useState<'poll' | 'gif' | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const typingCh = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastTyping = useRef(0)

  async function loadReactions(ids: string[]) {
    if (!ids.length) return setReactions([])
    const { data } = await supabase.from('reactions').select('message_id,user_id,emoji').in('message_id', ids)
    setReactions((data as Reaction[]) ?? [])
  }
  async function loadExtras(ids: string[]) {
    if (!ids.length) return
    const [p, v, t] = await Promise.all([
      supabase.from('polls').select('*').in('message_id', ids),
      supabase.from('poll_votes').select('message_id,user_id,option_idx').in('message_id', ids),
      inThread ? Promise.resolve({ data: [] }) : supabase.from('channels').select('*').in('parent_message_id', ids)
    ])
    setPolls(Object.fromEntries(((p.data as Poll[]) ?? []).map(x => [x.message_id, x]))); setVotes((v.data as Vote[]) ?? [])
    setThreads(Object.fromEntries(((t.data as (Channel & { parent_message_id: string })[]) ?? []).map(x => [x.parent_message_id, x])))
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => { setMsgs(m => { loadExtras(m.map(x => x.id)); return m }) })
      .subscribe()
    const tc = supabase.channel(`typing:${channel.id}`)
    tc.on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload.id !== userId) setTyping(t => ({ ...t, [payload.id]: { name: payload.name, at: Date.now() } })) }).subscribe()
    typingCh.current = tc
    const timer = setInterval(() => setTyping(t => Object.fromEntries(Object.entries(t).filter(([, v]) => Date.now() - v.at < 4000))), 1000)
    return () => { supabase.removeChannel(sub); supabase.removeChannel(tc); clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])
  const idsKey = msgs.map(m => m.id).join(',')
  useEffect(() => { bottom.current?.scrollIntoView() }, [msgs.length])
  useEffect(() => { loadExtras(msgs.map(m => m.id)) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idsKey])

  function onType(v: string) {
    setText(v)
    if (v && Date.now() - lastTyping.current > 2000) { lastTyping.current = Date.now(); typingCh.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId, name: username } }) }
  }
  async function post(content: string, extra: Partial<Message> = {}) {
    setSendErr('')
    const { error } = await supabase.from('messages').insert({ channel_id: channel.id, author_id: userId, content, ...extra })
    if (error) { setSendErr(error.code === '42501' ? 'Não foi possível enviar agora: modo lento, silêncio, bloqueio ou falta de acesso.' : error.message); return false }
    return true
  }
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim(); if (!content) return
    const reply_to = replyTo?.id ?? null; setText(''); setReplyTo(null)
    if (!(await post(content, { reply_to }))) setText(content)
  }
  async function upload(file: File) {
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) return notify(error.message)
    await post(file.name, { attachment_url: supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl })
  }
  async function saveEdit() {
    const content = editText.trim()
    if (editId && content) await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editId)
    setEditId(null)
  }
  async function react(m: Message, emoji: string) {
    setPickerFor(null)
    const mine = reactions.find(r => r.message_id === m.id && r.user_id === userId && r.emoji === emoji)
    const { error } = mine ? await supabase.from('reactions').delete().match({ message_id: m.id, user_id: userId, emoji }) : await supabase.from('reactions').insert({ message_id: m.id, user_id: userId, emoji })
    if (error) notify(error.message)
  }
  async function pin(m: Message) { const { error } = await supabase.rpc('pin_message', { p_id: m.id, p_pinned: !m.pinned }); if (error) notify(error.message) }
  async function votePoll(mid: string, idx: number) { const { error } = await supabase.rpc('vote_poll', { p_message: mid, p_idx: idx }); if (error) notify(error.message) }
  async function openThread(m: Message) {
    let t = threads[m.id]
    if (!t) {
      const { data, error } = await supabase.rpc('create_thread', { p_message: m.id, p_name: m.content.replace(/\s+/g, ' ').slice(0, 40) })
      if (error) return notify(error.message)
      const { data: ch } = await supabase.from('channels').select('*').eq('id', data as string).maybeSingle()
      if (!ch) return; t = ch as Channel; setThreads(x => ({ ...x, [m.id]: t! }))
    }
    setThread(t); setPanel('thread')
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
  const act = 'grid h-7 w-7 place-items-center rounded-md text-holz-mute hover:bg-holz-200 hover:text-holz-900'
  const headBtn = (on: boolean) => on ? 'text-holz-500' : 'text-holz-mute hover:text-holz-900'

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-holz-line px-4">
          <Icon name={inThread ? 'thread' : isDM ? 'dm' : 'text'} className="text-holz-mute" />
          <span className="truncate font-bold">{channel.name}</span>
          {!inThread && channel.topic && <><span className="h-5 w-px bg-holz-line" /><span className="truncate text-sm text-holz-mute">{channel.topic}</span></>}
          <span className="flex-1" />
          {(channel.slowmode_seconds ?? 0) > 0 && <span title="Modo lento" className="flex items-center gap-1 text-xs text-holz-mute"><Icon name="clock" size={14} />{channel.slowmode_seconds}s</span>}
          {channel.is_private && <span title="Canal privado" className="text-holz-mute"><Icon name="lock" size={16} /></span>}
          {isDM && onCall && !inThread && <button title="Ligar" onClick={onCall} className={headBtn(false)}><Icon name="phone" /></button>}
          {!inThread && <>
            <button title="Mensagens fixadas" onClick={openPins} className={headBtn(panel === 'pins')}><Icon name="pin" /></button>
            <button title="Buscar" onClick={() => { setPanel(p => p === 'search' ? null : 'search'); setResults(null) }} className={headBtn(panel === 'search')}><Icon name="search" /></button>
          </>}
          {onClose && <button title="Fechar" onClick={onClose} className={headBtn(false)}><Icon name="x" /></button>}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {!msgs.length && <div className="px-6 py-10 text-center text-holz-mute"><p className="text-lg font-semibold text-holz-900">{inThread ? 'Comece o tópico' : `Este é o começo de ${isDM ? 'sua conversa' : `#${channel.name}`}`}</p><p className="mt-1 text-sm">Mande a primeira mensagem.</p></div>}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1]; const mine = m.author_id === userId
            const compact = groupsWith(prev, m) && !m.reply_to
            const newDay = !prev || !isSameDay(prev.created_at, m.created_at)
            const mention = !mine && mentionsUser(m.content, username)
            const parent = m.reply_to ? byId.get(m.reply_to) : null
            const rs = reactions.filter(r => r.message_id === m.id)
            const grouped = [...new Set(rs.map(r => r.emoji))].map(e => ({ emoji: e, n: rs.filter(r => r.emoji === e).length, me: rs.some(r => r.emoji === e && r.user_id === userId) }))
            const pl = polls[m.id]; const th = threads[m.id]
            const link = !pl && !m.attachment_url ? firstUrl(m.content) : undefined
            return (
              <Fragment key={m.id}>
                {newDay && <div className="my-3 flex items-center gap-3 px-4 text-xs font-semibold text-holz-mute"><span className="h-px flex-1 bg-holz-line" />{dayLabel(m.created_at)}<span className="h-px flex-1 bg-holz-line" /></div>}
                <div className={`group relative flex gap-4 px-4 ${compact ? 'py-0.5' : 'mt-3 py-0.5'} hover:bg-holz-100/70 ${mention ? 'border-l-2 border-holz-500 bg-holz-500/10 pl-3.5' : ''}`}>
                  {compact
                    ? <span className="w-10 shrink-0 pt-1 text-right text-[10px] text-holz-mute opacity-0 group-hover:opacity-100">{clock(m.created_at)}</span>
                    : <Avatar name={m.profiles?.username ?? '?'} url={m.profiles?.avatar_url} size={40} />}
                  <div className="min-w-0 flex-1">
                    {m.reply_to && (
                      <div className="mb-0.5 flex items-center gap-1.5 truncate text-xs text-holz-mute"><Icon name="reply" size={12} />
                        {parent ? <><b className="text-holz-900">{parent.profiles?.username}</b><span className="truncate">{parent.content.replace(/[*`_~|]/g, '').slice(0, 90)}</span></> : 'mensagem anterior'}</div>
                    )}
                    {!compact && (
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold" style={{ color: nameColor?.(m.author_id) }}>{m.profiles?.username ?? 'usuário'}</span>
                        <span className="text-xs text-holz-mute">{clock(m.created_at)}</span>
                        {m.pinned && <span title="Fixada" className="self-center text-holz-500"><Icon name="pin" size={12} /></span>}
                      </div>
                    )}
                    {pl ? (() => {
                      const mv = votes.filter(v => v.message_id === m.id); const total = new Set(mv.map(v => v.user_id)).size
                      return (
                        <div className="mt-1 max-w-sm space-y-1.5 rounded-lg border border-holz-line bg-holz-100 p-3">
                          <div className="flex items-center gap-2 font-semibold"><Icon name="poll" size={16} className="text-holz-500" />{pl.question}</div>
                          {pl.options.map((o, idx) => {
                            const n = mv.filter(v => v.option_idx === idx).length; const my = mv.some(v => v.option_idx === idx && v.user_id === userId)
                            return (
                              <button key={idx} onClick={() => votePoll(m.id, idx)} className={`relative block w-full overflow-hidden rounded-md border px-3 py-1.5 text-left text-sm ${my ? 'border-holz-500' : 'border-holz-line'}`}>
                                <span className="absolute inset-y-0 left-0 bg-holz-500/20" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                                <span className="relative flex justify-between gap-3"><span>{o}</span><span className="text-xs">{n}</span></span>
                              </button>
                            )
                          })}
                          <div className="text-xs text-holz-mute">{total} {total === 1 ? 'voto' : 'votos'}{pl.multiple && ' · várias respostas'}</div>
                        </div>
                      )
                    })() : m.attachment_url
                      ? IMG.test(m.attachment_url)
                        ? <img src={m.attachment_url} className="mt-1 max-h-72 max-w-full rounded-lg" />
                        : <a className="mt-1 inline-flex items-center gap-1.5 text-holz-500 underline" target="_blank" rel="noreferrer noopener" href={m.attachment_url}><Icon name="clip" size={16} />{m.content}</a>
                      : editId === m.id
                        ? <div><input autoFocus value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }} className="field" /><p className="mt-1 text-xs text-holz-mute">Enter para salvar · Esc para cancelar</p></div>
                        : <div className="whitespace-pre-wrap break-words leading-relaxed"><span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />{m.edited_at && <span className="ml-1 text-[10px] text-holz-mute">(editada)</span>}</div>}
                    {link && <LinkPreview url={link} />}
                    {grouped.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {grouped.map(g => <button key={g.emoji} onClick={() => react(m, g.emoji)} className={`rounded-full border px-2 py-0.5 text-sm ${g.me ? 'border-holz-500 bg-holz-500/15' : 'border-holz-line hover:border-holz-mute'}`}>{g.emoji} {g.n}</button>)}
                      </div>
                    )}
                    {th && !inThread && <button onClick={() => openThread(m)} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-holz-500 hover:underline"><Icon name="thread" size={14} />Ver tópico</button>}
                  </div>
                  <div className="absolute -top-3 right-4 z-10 hidden gap-0.5 rounded-lg border border-holz-line bg-holz-100 p-0.5 shadow-md group-hover:flex">
                    <button title="Reagir" className={act} onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}><Icon name="smile" size={16} /></button>
                    <button title="Responder" className={act} onClick={() => setReplyTo(m)}><Icon name="reply" size={16} /></button>
                    {!inThread && !isDM && <button title="Abrir tópico" className={act} onClick={() => openThread(m)}><Icon name="thread" size={16} /></button>}
                    <button title="Encaminhar" className={act} onClick={() => setForwardMsg(m)}><Icon name="forward" size={16} /></button>
                    {canPin && <button title={m.pinned ? 'Desafixar' : 'Fixar'} className={act} onClick={() => pin(m)}><Icon name="pin" size={16} /></button>}
                    {mine && !m.attachment_url && !pl && <button title="Editar" className={act} onClick={() => { setEditId(m.id); setEditText(m.content) }}><Icon name="edit" size={16} /></button>}
                    {(mine || canModerate) && <button title="Apagar" className={`${act} hover:!text-holz-coral`} onClick={() => confirm('Apagar esta mensagem?') && supabase.from('messages').delete().eq('id', m.id)}><Icon name="trash" size={16} /></button>}
                  </div>
                  {pickerFor === m.id && (
                    <div className="absolute -top-12 right-4 z-20 flex gap-1 rounded-full border border-holz-line bg-holz-100 px-2 py-1 shadow-md">
                      {EMOJIS.map(e => <button key={e} onClick={() => react(m, e)} className="text-lg hover:scale-125">{e}</button>)}
                    </div>
                  )}
                </div>
              </Fragment>
            )
          })}
          <div ref={bottom} />
        </div>

        <div className="h-5 px-6 text-xs text-holz-mute">{typers.length > 0 && `${typers.slice(0, 3).join(', ')} ${typers.length > 1 ? 'estão digitando…' : 'está digitando…'}`}</div>
        {replyTo && (
          <div className="mx-4 flex items-center gap-2 rounded-t-lg bg-holz-100 px-3 py-1.5 text-xs text-holz-mute">
            <Icon name="reply" size={14} /> Respondendo a <b className="text-holz-900">{replyTo.profiles?.username}</b>
            <span className="flex-1 truncate">{replyTo.content}</span><button onClick={() => setReplyTo(null)}><Icon name="x" size={14} /></button>
          </div>
        )}
        {sendErr && <p className="mx-4 mb-1 text-sm text-holz-coral">{sendErr}</p>}
        <form onSubmit={send} className="relative px-4 pb-4">
          {showEmoji && (
            <div className="absolute bottom-16 right-4 z-10 grid w-64 grid-cols-6 gap-1 rounded-xl border border-holz-line bg-holz-100 p-2 shadow-lg">
              {PICKER.map(e => <button type="button" key={e} onClick={() => { setText(t => t + e); setShowEmoji(false) }} className="rounded p-1 text-lg hover:bg-holz-200">{e}</button>)}
            </div>
          )}
          <div className={`flex items-center gap-1 bg-holz-200 px-2 ${replyTo ? 'rounded-b-xl' : 'rounded-xl'}`}>
            <label title="Anexar arquivo" className={`${act} cursor-pointer`}><Icon name="plus" /><input type="file" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            <input value={text} onChange={e => onType(e.target.value)} placeholder={isDM ? `Mensagem para ${channel.name}` : inThread ? 'Responder no tópico' : `Mensagem em #${channel.name}`} className="h-11 min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-holz-mute" />
            <button type="button" title="Enquete" onClick={() => setDialog('poll')} className={act}><Icon name="poll" size={20} /></button>
            <button type="button" title="GIF" onClick={() => setDialog('gif')} className={act}><Icon name="gif" size={20} /></button>
            <button type="button" title="Emoji" onClick={() => setShowEmoji(v => !v)} className={act}><Icon name="smile" size={20} /></button>
            <button title="Enviar" className={`${act} !text-holz-500`}><Icon name="send" size={20} /></button>
          </div>
        </form>
      </div>

      {panel && (
        <aside className={`shrink-0 overflow-y-auto border-l border-holz-line bg-holz-100 ${panel === 'thread' ? 'w-[26rem] p-0' : 'w-72 p-4'}`}>
          {panel === 'thread' && thread && <Chat key={thread.id} channel={thread} userId={userId} username={username} canModerate={canModerate} nameColor={nameColor} inThread onClose={() => setPanel(null)} />}
          {panel === 'search' && (
            <form onSubmit={search} className="mb-3 flex gap-2">
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar neste canal" className="field" />
              <button className="btn bg-holz-500 px-3 text-holz-onaccent"><Icon name="search" size={16} /></button>
            </form>
          )}
          {(panel === 'pins' || panel === 'search') && <>
            <p className="mb-2 text-sm font-bold">{panel === 'pins' ? 'Mensagens fixadas' : 'Resultados'}</p>
            {(panel === 'pins' ? pins : results ?? []).map(m => (
              <div key={m.id} className="mb-2 rounded-lg border border-holz-line bg-holz-50 p-2.5 text-sm">
                <b>{m.profiles?.username}</b><span className="ml-2 text-xs text-holz-mute">{dayLabel(m.created_at)} {clock(m.created_at)}</span>
                <div className="break-words">{m.content}</div>
              </div>
            ))}
            {((panel === 'pins' && !pins.length) || (panel === 'search' && results && !results.length)) && <p className="text-sm text-holz-mute">Nada por aqui.</p>}
          </>}
        </aside>
      )}
      {dialog === 'poll' && <PollDialog channelId={channel.id} onClose={() => setDialog(null)} />}
      {dialog === 'gif' && <GifDialog onPick={url => post('GIF', { attachment_url: url })} onClose={() => setDialog(null)} />}
      {forwardMsg && <ForwardDialog message={forwardMsg} userId={userId} onClose={() => setForwardMsg(null)} />}
    </div>
  )
}
