import { useCallback, useEffect, useState } from 'react'
import { supabase, type Channel, type Member, type Role, type Server } from '../../lib/supabase'

export function useServerData(server: Server | null, userId: string, username: string, myStatus: string = 'online') {
  const [channels, setChannels] = useState<Channel[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Record<string, string>>({})

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
    if (!server) { setOnline(new Set()); setStatuses({}); return }
    load()
    const sub = supabase.channel(`srv:${server.id}`)
    for (const table of ['channels', 'roles', 'members']) {
      sub.on('postgres_changes', { event: '*', schema: 'public', table }, () => { load() })
    }
    sub.subscribe()
    const pres = supabase.channel(`presence:${server.id}`, { config: { presence: { key: userId } } })
    pres.on('presence', { event: 'sync' }, () => {
      const st = pres.presenceState() as Record<string, { status?: string }[]>
      const map: Record<string, string> = {}
      for (const [k, v] of Object.entries(st)) map[k] = v[0]?.status ?? 'online'
      setStatuses(map); setOnline(new Set(Object.keys(map).filter(k => map[k] !== 'invisible')))
    })
      .subscribe(status => { if (status === 'SUBSCRIBED') pres.track({ username, status: myStatus }) })
    return () => { supabase.removeChannel(sub); supabase.removeChannel(pres) }
  }, [server, load, userId, username, myStatus])

  return { channels, roles, members, online, statuses, reload: load }
}
