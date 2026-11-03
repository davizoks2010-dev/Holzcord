import { useState } from 'react'
import schema from '../../assets/schema.sql?raw'
import { sbUrl } from '../../lib/supabase'
import { checkSchema } from '../../lib/schema'

export default function SchemaGate({ missing, onRecheck, onSkip }: { missing: string[]; onRecheck: () => void; onSkip: () => void }) {
  const [copied, setCopied] = useState(false); const [busy, setBusy] = useState(false)
  const ref = new URL(sbUrl).hostname.split('.')[0]
  async function copy() {
    try { await navigator.clipboard.writeText(schema); setCopied(true) } catch { alert('Não consegui copiar automaticamente. Abra o arquivo holzcord-banco-completo.sql e copie o conteúdo.') }
  }
  async function recheck() { setBusy(true); await checkSchema(); setBusy(false); onRecheck() }
  const step = (n: number, t: React.ReactNode) => (
    <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-holz-500 text-sm font-bold text-holz-onaccent">{n}</span><span>{t}</span></li>
  )
  return (
    <div className="grid h-full place-items-center bg-holz-rail p-6">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-holz-line bg-holz-100 p-8">
        <h1 className="text-2xl font-bold">Falta atualizar o seu banco de dados</h1>
        <p className="text-holz-mute">Para criar servidores e usar todos os recursos, o Supabase precisa receber a última versão do banco. Ainda falta: <b className="text-holz-900">{missing.join(', ')}</b>.</p>
        <ol className="space-y-3">
          {step(1, <>Clique em <button onClick={copy} className="rounded-md bg-holz-500 px-3 py-1 font-semibold text-holz-onaccent">{copied ? 'Copiado!' : 'Copiar o SQL'}</button></>)}
          {step(2, <>Abra o <a className="text-holz-500 underline" target="_blank" rel="noreferrer" href={`https://supabase.com/dashboard/project/${ref}/sql/new`}>editor de SQL do seu projeto</a>.</>)}
          {step(3, <>Cole o texto, clique em <b>Run</b> e espere aparecer "Success".</>)}
          {step(4, <>Volte aqui e clique em <b>Já fiz, verificar de novo</b>.</>)}
        </ol>
        <p className="text-sm text-holz-mute">É seguro rodar mais de uma vez: o SQL só cria o que falta.</p>
        <div className="flex items-center gap-3 pt-1">
          <button disabled={busy} onClick={recheck} className="rounded-lg bg-holz-500 px-4 py-2 font-semibold text-holz-onaccent disabled:opacity-60">{busy ? 'Verificando…' : 'Já fiz, verificar de novo'}</button>
          <button onClick={onSkip} className="text-sm text-holz-mute underline">Continuar mesmo assim</button>
        </div>
      </div>
    </div>
  )
}
