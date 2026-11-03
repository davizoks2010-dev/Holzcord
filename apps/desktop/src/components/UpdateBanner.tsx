import { useUpdate } from '../lib/update'

/** Aviso discreto no topo: baixando a atualizacao ou pronta para instalar. */
export default function UpdateBanner() {
  const { status, install } = useUpdate()
  if (status.state !== 'downloading' && status.state !== 'ready' && status.state !== 'available') return null
  return (
    <div className="fixed left-1/2 top-3 z-[70] -translate-x-1/2">
      {status.state === 'ready' ? (
        <div className="flex items-center gap-3 rounded-full border border-holz-500 bg-holz-100 py-1.5 pl-4 pr-1.5 text-sm shadow-lg">
          <span>Nova versão <b>{status.version}</b> pronta.</span>
          <button onClick={install} className="rounded-full bg-holz-500 px-3 py-1 font-semibold text-holz-onaccent hover:bg-holz-600">Reiniciar e atualizar</button>
        </div>
      ) : (
        <div className="rounded-full border border-holz-line bg-holz-100 px-4 py-1.5 text-sm shadow-lg">Baixando atualização… {status.percent ?? 0}%</div>
      )}
    </div>
  )
}
