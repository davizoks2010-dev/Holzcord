import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, sbKey } from './lib/supabase'
import Setup from './features/auth/Setup'
import Login from './features/auth/Login'
import Shell from './features/servers/Shell'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (!sbKey) return <Setup />
  if (!ready) return null
  return session ? <Shell session={session} /> : <Login />
}
