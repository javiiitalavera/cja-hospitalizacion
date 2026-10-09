import { useEffect, useRef } from 'react'

// Tamaño inicial de cada campo de los informes, en líneas de texto. El
// campo crece solo según se escribe; esto fija únicamente de cuánto
// arranca (un campo corto como "Alergias" no necesita lo mismo que
// "Evolución"). Sin valor, arranca con el tamaño de siempre.
export const FILAS_CAMPO: Record<string, number> = {
  // Informe de ingreso
  alergias: 2, antecedentes_medicos: 5, antecedentes_quirurgicos: 3, antecedentes_familiares: 3,
  vgi_social: 3, vgi_funcional: 3, vgi_cognitivo: 3, vgi_sensorial: 2, vgi_nutricional: 2, vgi_dolor: 2, vgi_otros: 2,
  personalidad_previa: 3, evolucion: 8,
  situacion_cognitivo: 3, situacion_conductual: 3, situacion_animico: 3, situacion_funcional: 3, situacion_social: 3,
  exploracion_fisica: 4, exploracion_neurologica: 4, exploracion_psicopatologica: 4, exploraciones_complementarias: 5,
  impresion_diagnostica: 4, plan_objetivos: 4, plan_medicacion: 3, plan_otros_cuidados: 3,
  // Informe de alta
  exploraciones_durante_ingreso: 4, estudio_neuropsicologico: 4, informe_fisioterapia: 4, informe_terapia_ocupacional: 4,
  evolucion_clinica: 8, juicios_clinicos: 4, recomendaciones_conductuales: 4, cuidados_enfermeria: 4, otras_recomendaciones: 3,
}

function AutoTextarea({ value, onChange, disabled, filas, autoFocus }: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  filas?: number
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])
  // Línea de texto = 1,25 rem; más 1,25 rem de relleno y borde.
  const minHeight = filas ? `${filas * 1.25 + 1.25}rem` : '4rem'
  return (
    <textarea
      ref={ref}
      className={`textarea ${disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
      style={{ minHeight, overflow: 'hidden', resize: 'none' }}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    />
  )
}


export { AutoTextarea }
