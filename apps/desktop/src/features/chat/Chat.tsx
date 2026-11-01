import { useEffect, useRef, useState } from 'react'
import { supabase, type Channel, type Message } from '../../lib/supabase'
import { renderMarkdown } from '../../lib/format'

const SELECT = '*, profiles(username)'

export default function Chat({ channel, userId }: { channel: Channel; userId: string }) {
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
  useEffect(() => bottom.current?.scrollIntoView(), [msgs])

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
      <header className="p-3 font-semibold border-b border-holz-900/15"># {channel.name}</header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map(m => (
          <div key={m.id} className="group">
            <span className="font-semibold text-holz-500">{m.profiles?.username ?? 'usuário'}</span>
            <span className="ml-2 text-xs text-[#8A7A6A]">{new Date(m.created_at).toLocaleString()}</span>
            {m.author_id === userId && (
              <button className="ml-2 hidden text-xs text-coral group-hover:inline"
                onClick={() => supabase.from('messages').delete().eq('id', m.id)}>apagar</button>
            )}
            {m.attachment_url
              ? /\.(png|jpe?g|gif|webp)$/i.test(m.attachment_url)
                ? <img src={m.attachment_url} className="mt-1 max-h-72 rounded" />
                : <a className="block text-sky-700 underline" target="_blank" rel="noreferrer noopener" href={m.attachment_url}>{m.content}</a>
              : <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex gap-2 p-4">
        <label className="grid h-10 w-10 cursor-pointer place-items-center rounded bg-holz-200">+
          <input type="file" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <input value={text} onChange={e => setText(e.target.value)} placeholder={`Conversar em #${channel.name}`}
          className="flex-1 rounded bg-holz-200 px-3 outline-none" />
      </form>
    </div>
  )
}
