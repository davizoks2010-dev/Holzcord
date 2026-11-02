import { useEffect, useRef, useState } from 'react'
import { supabase, type Channel, type Message } from '../../lib/supabase'
import { renderMarkdown } from '../../lib/format'
import Icon from '../../components/Icon'

const SELECT = '*, profiles(username)'

export default function Chat({ channel, userId, canModerate = false }: { channel: Channel; userId: string; canModerate?: boolean }) {
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  async function saveEdit() {
    const content = editText.trim()
    if (editId && content) await supabase.from('messages').update({ content, edited_at: new Date().toISOString() }).eq('id', editId)
    setEditId(null)
  }
  const [msgs, setMsgs] = useState<Message[]>([])
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('messages').select(SELECT).eq('channel_id', channel.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setMsgs(((data as Message[]) ?? []).reverse()))
    const sub = supabase.channel(`msgs:${channel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channel.id}` },
        async payload => {
          if (payload.eventType === 'DELETE') return setMsgs(m => m.filter(x => x.id !== (payload.old as Message).id))
          const { data } = await supabase.from('messages').select(SELECT).eq('id', (payload.new as Message).id).single()
          if (!data) return
          setMsgs(m => payload.eventType === 'INSERT' ? [...m, data as Message] : m.map(x => x.id === data.id ? (data as Message) : x))
        }).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channel.id])
  useEffect(() => { bottom.current?.scrollIntoView() }, [msgs])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim(); if (!content) return
    setText('')
    await supabase.from('messages').insert({ channel_id: channel.id, author_id: userId, content })
  }
  async function upload(file: File) {
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) return alert(error.message)
    const url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
    await supabase.from('messages').insert({ channel_id: channel.id, author_id: userId, content: file.name, attachment_url: url })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-holz-line p-4 font-display text-lg font-semibold">
        <Icon name="text" className="text-holz-500" /> {channel.name}
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {msgs.map(m => {
          const mine = m.author_id === userId
          return (
            <div key={m.id} className={`group flex ${mine ? 'justify-end' : ''}`}>
              <div className={`max-w-[75%] border border-holz-line px-4 py-2.5 ${mine ? 'rounded-petalme bg-holz-200' : 'rounded-petal bg-holz-100'}`}>
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className={`font-display font-semibold ${mine ? 'text-holz-500' : 'text-holz-live'}`}>{m.profiles?.username ?? 'usuário'}</span>
                  <span className="font-mono text-[11px] text-holz-mute">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {mine && !m.attachment_url && (
                    <button className="hidden text-xs text-holz-mute group-hover:inline" onClick={() => { setEditId(m.id); setEditText(m.content) }}>editar</button>
                  )}
                  {(mine || canModerate) && (
                    <button className="hidden text-xs text-holz-coral group-hover:inline" onClick={() => supabase.from('messages').delete().eq('id', m.id)}>apagar</button>
                  )}
                </div>
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
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex items-center gap-2 p-4">
        <label title="Anexar" className="pebble grid h-11 w-11 cursor-pointer place-items-center bg-holz-200 text-holz-mute hover:text-holz-500">
          <Icon name="clip" /><input type="file" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={`Conversar em ${channel.name}`}
          className="h-11 flex-1 rounded-leaf border border-holz-line bg-holz-100 px-4 outline-none focus:border-holz-500" />
        <button title="Enviar" className="btn h-11 bg-holz-500 text-holz-rail hover:bg-holz-600"><Icon name="send" size={18} /></button>
      </form>
    </div>
  )
}
