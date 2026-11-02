import { useCallback, useEffect, useState } from 'react'
import { supabase, type Channel, type Member, type Role, type Server } from '../../lib/supabase'

export function useServerData(server: Server | null, userId: string, username: string) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!server) { setChannels([]); setRoles([]); setMembers([]); return }
    const [c, r, m] = await Promise.all([
      supabase.from('channels').select('*').eq('server_id', server.id).order('created_at'),
      supabase.from('roles').select('*').eq('server_id', server.id),
      supabase.from('members').select('server_id,user_id,role_id,profiles(username)').eq('server_id', server.id)
    ])
    setChannels((c.data as Channel[]) ?? []); setRoles((r.data as Role[]) ?? []); setMembers((m.data as unknown as Member[]) ?? [])
  }, [server])

  useEffect(() => {
    if (!server) { setOnline(new Set()); return }
    load()
    const sub = supabase.channel(`srv:${server.id}`)
    for (const table of ['channels', 'roles', 'members']) {
      sub.on('postgres_changes', { event: '*', schema: 'public', table }, () => { load() })
    }
    sub.subscribe()
    const pres = supabase.channel(`presence:${server.id}`, { config: { presence: { key: userId } } })
    pres.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(pres.presenceState()))))
      .subscribe(status => { if (status === 'SUBSCRIBED') pres.track({ username }) })
    return () => { supabase.removeChannel(sub); supabase.removeChannel(pres) }
  }, [server, load, userId, username])

  return { channels, roles, members, online, reload: load }
}
