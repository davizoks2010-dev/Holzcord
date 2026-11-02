import { useCallback, useEffect, useState } from 'react'
import { supabase, type Channel } from '../../lib/supabase'

export interface DMEntry { channel: Channel; other: { id: string; username: string; avatar_url: string | null } }

export function useDMs(userId: string) {
  const [dms, setDms] = useState<DMEntry[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase.from('dm_members').select('channel_id,user_id,profiles(username,avatar_url)')
    const rows = (data ?? []) as unknown as { channel_id: string; user_id: string; profiles: { username: string; avatar_url: string | null } | null }[]
    const out: DMEntry[] = rows.filter(r => r.user_id !== userId).map(r => ({
      channel: { id: r.channel_id, server_id: null, name: r.profiles?.username ?? 'usuário', type: 'dm' as const },
      other: { id: r.user_id, username: r.profiles?.username ?? 'usuário', avatar_url: r.profiles?.avatar_url ?? null }
    }))
    setDms(out)
  }, [userId])
  useEffect(() => {
    load()
    const sub = supabase.channel(`dms:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_members', filter: `user_id=eq.${userId}` }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [load, userId])
  return { dms, reload: load }
}
