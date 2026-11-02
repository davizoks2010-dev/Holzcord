import logo from '../../assets/logo.svg'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../../components/Icon'

export default function Login() {
  const [mode, setMode] = useState<'name' | 'in' | 'up'>('name')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [username, setUsername] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = mode === 'name'
      ? await supabase.auth.signInAnonymously({ options: { data: { username: username.trim() } } })
      : mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { username } } })
    setBusy(false)
    if (error) setErr(error.message)
  }
  const input = 'w-full rounded-leafsm bg-holz-200 border border-holz-line p-2.5 text-holz-900 outline-none focus:border-holz-500'
  return (
    <div className="h-full grid place-items-center bg-holz-rail">
      <form onSubmit={submit} className="w-[26rem] space-y-3 rounded-[34px_10px_34px_10px] border border-holz-line bg-holz-100 p-9">
        <img src={logo} className="mx-auto h-16" />
        <h1 className="text-center font-display text-3xl font-semibold text-holz-900">holzcord</h1>
        <p className="text-center font-mono text-xs text-holz-mute">{mode === 'name' ? '// escolha um nome e entre, sem senha' : mode === 'in' ? '// entre na sua conta' : '// crie sua conta gratuita'}</p>
        {(mode === 'up' || mode === 'name') && <input className={input} placeholder="Nome de usuário" value={username} onChange={e => setUsername(e.target.value)} required minLength={2} />}
        {mode !== 'name' && <input className={input} type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />}
        {mode !== 'name' && <input className={input} type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />}
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        <button disabled={busy} className="btn w-full justify-center bg-holz-500 text-holz-rail hover:bg-holz-600 disabled:opacity-60"><Icon name="leaf" size={18} />{mode === 'name' ? 'Entrar' : mode === 'in' ? 'Entrar' : 'Registrar'}</button>
        <button type="button" className="text-sm text-holz-500" onClick={() => setMode(mode === 'name' ? 'in' : 'name')}>
          {mode === 'name' ? 'Prefiro entrar com e-mail e senha' : 'Entrar só com nome (sem senha)'}
        </button>
        {mode !== 'name' && <button type="button" className="ml-4 text-sm text-holz-mute" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Criar conta' : 'Já tenho conta'}</button>}
      </form>
    </div>
  )
}
