import { useCallback, useEffect, useState } from 'react'
import { supabase, type Channel } from '../../lib/supabase'

export interface DMEntry {
  channel: Channel
  other: { id: string; username: string; avatar_url: string | null }
  others: { id: string; username: string; avatar_url: string | null }[]
  isGroup: boolean
}
type Row = { channel_id: string; user_id: string; profiles: { username: string; avatar_url: string | null } | null }

export function useDMs(userId: string) {
  const [dms, setDms] = useState<DMEntry[]>([])
  const load = useCallback(async () => {
    const [chs, mem] = await Promise.all([
      supabase.from('channels').select('id,name,is_group').eq('type', 'dm'),
      supabase.from('dm_members').select('channel_id,user_id,profiles(username,avatar_url)')
    ])
    const rows = (mem.data ?? []) as unknown as Row[]
    const out: DMEntry[] = (chs.data ?? []).map(c => {
      const others = rows.filter(r => r.channel_id === c.id && r.user_id !== userId)
        .map(r => ({ id: r.user_id, username: r.profiles?.username ?? 'usuário', avatar_url: r.profiles?.avatar_url ?? null }))
      const isGroup = !!c.is_group
      const label = isGroup ? `${c.name} (${others.length + 1})` : (others[0]?.username ?? 'conversa')
      return { channel: { id: c.id, server_id: null, name: label, type: 'dm' as const, is_group: isGroup }, other: others[0] ?? { id: '', username: label, avatar_url: null }, others, isGroup }
    })
    setDms(out)
  }, [userId])
  useEffect(() => {
    load()
    const sub = supabase.channel(`dms:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_members' }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [load, userId])
  return { dms, reload: load }
}
