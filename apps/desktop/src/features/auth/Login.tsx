import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import logo from '../../assets/logo.svg'

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
  const title = mode === 'name' ? 'Entre com o seu nome' : mode === 'in' ? 'Bem-vindo de volta' : 'Crie a sua conta'
  const sub = mode === 'name' ? 'Escolha como você quer ser chamado. Sem senha, sem e-mail.' : mode === 'in' ? 'Entre com o seu e-mail e a sua senha.' : 'Leva menos de um minuto.'

  return (
    <div className="grid h-full grid-cols-1 bg-holz-50 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="hidden flex-col justify-between bg-holz-rail p-12 md:flex">
        <div className="flex items-center gap-3"><img src={logo} className="h-10 w-10" /><span className="font-brand text-2xl font-semibold">holzcord</span></div>
        <div>
          <h2 className="max-w-sm text-4xl font-bold leading-tight">Seu canto para conversar com quem importa.</h2>
          <p className="mt-4 max-w-sm text-lg text-holz-mute">Mensagens, chamadas de voz e vídeo, e compartilhamento de tela. Gratuito e sem anúncios.</p>
        </div>
        <p className="text-sm text-holz-mute">Feito para grupos de amigos, estudos e comunidades.</p>
      </div>
      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <img src={logo} className="mx-auto h-14 md:hidden" />
          <div><h1 className="text-3xl font-bold">{title}</h1><p className="mt-1 text-holz-mute">{sub}</p></div>
          {(mode === 'up' || mode === 'name') && <label className="block text-sm font-semibold">Seu nome<input className="field mt-1 font-normal" placeholder="Como os amigos vão te ver" value={username} onChange={e => setUsername(e.target.value)} required minLength={2} maxLength={32} autoFocus /></label>}
          {mode !== 'name' && <label className="block text-sm font-semibold">E-mail<input className="field mt-1 font-normal" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>}
          {mode !== 'name' && <label className="block text-sm font-semibold">Senha<input className="field mt-1 font-normal" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} /></label>}
          {err && <p className="rounded-lg border border-holz-coral bg-holz-coral/10 px-3 py-2 text-sm">{err}</p>}
          <button disabled={busy} className="btn w-full justify-center bg-holz-500 py-2.5 text-holz-onaccent hover:bg-holz-600 disabled:opacity-60">{busy ? 'Entrando…' : mode === 'up' ? 'Criar conta' : 'Entrar'}</button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" className="text-holz-500 hover:underline" onClick={() => setMode(mode === 'name' ? 'in' : 'name')}>{mode === 'name' ? 'Prefiro usar e-mail e senha' : 'Entrar só com um nome'}</button>
            {mode !== 'name' && <button type="button" className="text-holz-mute hover:underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Criar uma conta' : 'Já tenho conta'}</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
