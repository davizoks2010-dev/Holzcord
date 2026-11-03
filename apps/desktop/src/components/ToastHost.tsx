import { useToasts } from '../lib/toast'

export default function ToastHost() {
  const items = useToasts(s => s.items)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {items.map(t => (
        <div key={t.id} className={`pointer-events-auto max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${t.kind === 'error' ? 'border-holz-coral bg-holz-100 text-holz-900' : 'border-holz-live bg-holz-100 text-holz-900'}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
