import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, type Message } from '../../lib/supabase'

/** Controla canais nao lidos e avisa quando chega uma mensagem nova em outro canal. */
export function useUnread(userId: string, channelIds: string[], openId: string | null, onIncoming: (m: Message, isOpen: boolean) => void) {
  const [unread, setUnread] = useState<Set<string>>(new Set())
  const key = [...channelIds].sort().join(',')
  const openRef = useRef(openId); openRef.current = openId
  const cbRef = useRef(onIncoming); cbRef.current = onIncoming

  const markRead = useCallback(async (cid: string) => {
    setUnread(u => { if (!u.has(cid)) return u; const n = new Set(u); n.delete(cid); return n })
    await supabase.from('read_states').upsert({ user_id: userId, channel_id: cid, last_read: new Date().toISOString() })
  }, [userId])

  useEffect(() => {
    if (!channelIds.length) { setUnread(new Set()); return }
    let alive = true
    ;(async () => {
      const [rs, ms] = await Promise.all([
        supabase.from('read_states').select('channel_id,last_read').eq('user_id', userId).in('channel_id', channelIds),
        supabase.from('messages').select('channel_id,created_at,author_id').in('channel_id', channelIds).neq('author_id', userId).order('created_at', { ascending: false }).limit(300)
      ])
      if (!alive) return
      const read = new Map((rs.data ?? []).map(r => [r.channel_id as string, r.last_read as string]))
      const latest = new Map<string, string>()
      for (const m of ms.data ?? []) if (!latest.has(m.channel_id)) latest.set(m.channel_id, m.created_at)
      const next = new Set<string>()
      latest.forEach((at, cid) => { if (cid !== openRef.current && (!read.has(cid) || at > read.get(cid)!)) next.add(cid) })
      setUnread(next)
    })()
    const sub = supabase.channel(`unread:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new as Message
        if (m.author_id === userId || !channelIds.includes(m.channel_id)) return
        const isOpen = m.channel_id === openRef.current
        if (!isOpen) setUnread(u => new Set(u).add(m.channel_id))
        cbRef.current(m, isOpen)
      }).subscribe()
    return () => { alive = false; supabase.removeChannel(sub) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId])

  useEffect(() => { if (openId) markRead(openId) }, [openId, markRead])
  return { unread, markRead }
}
