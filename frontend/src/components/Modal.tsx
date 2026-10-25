import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A modal dialog on the native <dialog> element: focus is trapped, Escape
 * closes it and the backdrop is the browser's. Mounted while open.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // jsdom has no showModal; the dialog is just open there.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])

  return (
    <dialog ref={ref} className="modal" aria-label={title} onClose={onClose} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="toggle" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  )
}
