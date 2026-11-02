import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface Person { id: string; username: string; avatar_url: string | null }
export interface FriendRow { id: string; status: 'pending' | 'accepted'; incoming: boolean; person: Person }

export function useFriends(userId: string) {
  const [friends, setFriends] = useState<FriendRow[]>([])
  const [blocked, setBlocked] = useState<Person[]>([])
  const load = useCallback(async () => {
    const [f, b] = await Promise.all([
      supabase.from('friendships').select('id,user_a,user_b,status'),
      supabase.from('blocks').select('blocked')
    ])
    const rows = (f.data ?? []) as { id: string; user_a: string; user_b: string; status: 'pending' | 'accepted' }[]
    const blockedIds = (b.data ?? []).map(x => x.blocked as string)
    const ids = [...new Set([...rows.flatMap(r => [r.user_a, r.user_b]), ...blockedIds])].filter(i => i !== userId)
    const { data: ps } = ids.length ? await supabase.from('profiles').select('id,username,avatar_url').in('id', ids) : { data: [] }
    const map = new Map((ps ?? []).map(p => [p.id as string, p as Person]))
    setFriends(rows.map(r => {
      const incoming = r.user_b === userId
      const pid = incoming ? r.user_a : r.user_b
      return { id: r.id, status: r.status, incoming, person: map.get(pid) ?? { id: pid, username: 'usuário', avatar_url: null } }
    }))
    setBlocked(blockedIds.map(i => map.get(i) ?? { id: i, username: 'usuário', avatar_url: null }))
  }, [userId])
  useEffect(() => {
    load()
    const sub = supabase.channel(`friends:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => { load() }).subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [load, userId])
  return { friends, blocked, reload: load }
}
