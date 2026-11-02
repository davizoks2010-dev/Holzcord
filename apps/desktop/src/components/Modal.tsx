import type { ReactNode } from 'react'

export default function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className={`${wide ? 'w-[46rem]' : 'w-[24rem]'} max-h-[85vh] overflow-y-auto rounded-[30px_8px_30px_8px] border border-holz-line bg-holz-100 p-7`}>
        <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
