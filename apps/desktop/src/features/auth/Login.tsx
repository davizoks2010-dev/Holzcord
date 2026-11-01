import logo from '../../assets/logo.svg'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [username, setUsername] = useState(''); const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { username } } })
    if (error) setErr(error.message)
  }
  const input = 'w-full rounded bg-holz-200 border border-holz-line p-2 outline-none focus:border-holz-500'
  return (
    <div className="h-full grid place-items-center bg-holz-rail">
      <form onSubmit={submit} className="w-96 space-y-3 rounded-lg bg-holz-50 p-8 border border-holz-line">
        <img src={logo} className="mx-auto h-16" /><h1 className="text-center text-2xl font-bold tracking-[0.08em] text-holz-900">holzcord</h1>
        <p className="text-center text-sm text-holz-mute">{mode === 'in' ? 'Entre na sua conta' : 'Crie sua conta gratuita'}</p>
        {mode === 'up' && <input className={input} placeholder="Nome de usuário" value={username} onChange={e => setUsername(e.target.value)} required minLength={2} />}
        <input className={input} type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        {err && <p className="text-sm text-coral">{err}</p>}
        <button className="w-full rounded bg-holz-500 p-2 font-semibold text-holz-rail hover:bg-holz-600">{mode === 'in' ? 'Entrar' : 'Registrar'}</button>
        <button type="button" className="text-sm text-holz-500" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Precisa de uma conta? Registre-se' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}
