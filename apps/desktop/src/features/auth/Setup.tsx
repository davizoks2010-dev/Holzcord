import { useState } from 'react'
import { sbUrl, saveSupabaseConfig } from '../../lib/supabase'
import logo from '../../assets/logo.svg'

// Primeira execucao: pede a chave publica (anon/publishable) do Supabase e guarda no app.
export default function Setup() {
  const [url, setUrl] = useState(sbUrl); const [key, setKey] = useState('')
  return (
    <div className="grid h-full place-items-center bg-holz-rail p-6">
      <form onSubmit={e => { e.preventDefault(); saveSupabaseConfig(url, key); location.reload() }} className="w-full max-w-md space-y-4 rounded-2xl border border-holz-line bg-holz-100 p-8">
        <img src={logo} className="h-12 w-12" />
        <div><h1 className="text-2xl font-bold">Vamos conectar o Holzcord</h1><p className="mt-1 text-holz-mute">Só precisa ser feito uma vez. Você encontra a chave no Supabase, em Project Settings › API Keys (a "anon" ou "publishable").</p></div>
        <label className="block text-sm font-semibold">Endereço do projeto<input className="field mt-1 font-normal" value={url} onChange={e => setUrl(e.target.value)} required /></label>
        <label className="block text-sm font-semibold">Chave pública<input className="field mt-1 font-normal" value={key} onChange={e => setKey(e.target.value)} placeholder="sb_publishable_…" required /></label>
        <button className="btn w-full justify-center bg-holz-500 py-2.5 text-holz-onaccent hover:bg-holz-600">Salvar e continuar</button>
      </form>
    </div>
  )
}
