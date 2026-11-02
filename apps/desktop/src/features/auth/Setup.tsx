import { useState } from 'react'
import { sbUrl, saveSupabaseConfig } from '../../lib/supabase'
import logo from '../../assets/logo.svg'

// Primeira execucao: pede a chave publica (anon/publishable) do Supabase e guarda no app.
export default function Setup() {
  const [url, setUrl] = useState(sbUrl); const [key, setKey] = useState('')
  const input = 'w-full rounded-leafsm bg-holz-200 border border-holz-line p-2.5 font-mono text-xs text-holz-900 outline-none focus:border-holz-500'
  return (
    <div className="grid h-full place-items-center bg-holz-rail">
      <form onSubmit={e => { e.preventDefault(); saveSupabaseConfig(url, key); location.reload() }}
        className="w-[30rem] space-y-3 rounded-[34px_10px_34px_10px] border border-holz-line bg-holz-100 p-9">
        <img src={logo} className="mx-auto h-16" />
        <h1 className="text-center font-display text-2xl font-semibold">Configurar o Holzcord</h1>
        <p className="text-center font-mono text-xs text-holz-mute">// só na primeira vez</p>
        <input className={input} value={url} onChange={e => setUrl(e.target.value)} placeholder="URL do Supabase" required />
        <input className={input} value={key} onChange={e => setKey(e.target.value)} placeholder="Chave anon / publishable (sb_publishable_…)" required />
        <button className="btn w-full justify-center bg-holz-500 text-holz-rail hover:bg-holz-600">Salvar e abrir</button>
      </form>
    </div>
  )
}
