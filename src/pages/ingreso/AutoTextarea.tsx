import { useEffect, useRef } from 'react'

function AutoTextarea({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      className={`textarea ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
      style={{ minHeight: '4rem', overflow: 'hidden', resize: 'none' }}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    />
  )
}


export { AutoTextarea }
