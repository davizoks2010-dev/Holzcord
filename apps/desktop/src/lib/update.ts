import { useEffect, useState } from 'react'

/** Estado das atualizacoes do app instalado (no modo de desenvolvimento fica sempre 'dev'). */
export function useUpdate() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'dev' })
  const [version, setVersion] = useState('')
  useEffect(() => {
    const u = window.holz?.update; if (!u) return
    u.get().then(r => { setStatus(r.status); setVersion(r.version) })
    u.onStatus(setStatus)
  }, [])
  return { status, version, check: () => window.holz?.update.check(), install: () => window.holz?.update.install() }
}
