import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, sbKey } from './lib/supabase'
import Setup from './features/auth/Setup'
import SchemaGate from './features/auth/SchemaGate'
import ToastHost from './components/ToastHost'
import UpdateBanner from './components/UpdateBanner'
import { checkSchema } from './lib/schema'
import Login from './features/auth/Login'
import Shell from './features/servers/Shell'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState<string[] | null>(null)
  const [skip, setSkip] = useState(false)
  const recheck = () => checkSchema().then(setMissing)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (session) recheck() }, [session])
  if (!sbKey) return <Setup />
  if (!ready) return null
  if (session && missing === null) return null
  if (session && missing && missing.length && !skip) return <SchemaGate missing={missing} onRecheck={recheck} onSkip={() => setSkip(true)} />
  return <>{session ? <Shell session={session} /> : <Login />}<ToastHost /><UpdateBanner /></>
}
