import { useEffect, useRef } from 'react'

function AutoTextarea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
      className="textarea"
      style={{ minHeight: '4rem', overflow: 'hidden', resize: 'none' }}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}


export { AutoTextarea }
