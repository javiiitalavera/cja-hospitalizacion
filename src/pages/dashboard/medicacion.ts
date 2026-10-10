// Cálculos del apartado "Medicación" del Dashboard: cuántos fármacos y cuántos psicofármacos tiene
// cada paciente al ingreso (informe de ingreso) y al alta (informe de alta). Funciones puras, para
// poder comprobarlas aparte. Requieren que el catálogo de fármacos esté cargado (lib/farmacos).

import {
  GRUPOS_PSICO, resumirMedicacion, type GrupoPsico, type ResumenMedicacion,
} from '../../lib/farmacos'

// Un episodio (un alta). `null` = ese informe no tiene ningún fármaco escrito.
export interface EpisodioMed { ingreso: ResumenMedicacion | null; alta: ResumenMedicacion | null }

export const COLUMNAS_MED = 'informe_ingreso(tratamiento_ingreso_estructurado), informe_alta(medicacion_estructurada)'

function unico<T>(x: T | T[] | null | undefined): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null)
}

function resumenOnull(filas: unknown): ResumenMedicacion | null {
  if (!Array.isArray(filas)) return null
  const r = resumirMedicacion(filas as { farmaco?: string; atc?: string; psico?: 'si' | 'no' }[])
  return r.total > 0 ? r : null
}

// Fila de la base de datos (un ingreso con sus dos informes) → episodio.
export function episodioMedDesdeFila(f: Record<string, any>): EpisodioMed {
  const ii = unico<Record<string, any>>(f.informe_ingreso)
  const ia = unico<Record<string, any>>(f.informe_alta)
  return {
    ingreso: resumenOnull(ii?.tratamiento_ingreso_estructurado),
    alta: resumenOnull(ia?.medicacion_estructurada),
  }
}

// ─── Resumen del periodo ─────────────────────────────────────

export type Momento = 'ingreso' | 'alta'

export interface Medias { episodios: number; farmacos: number; psicofarmacos: number }   // medias, sobre los episodios con medicación
export interface PorcentajeGrupo { clave: string; etiqueta: string; n: Record<Momento, number> }

export interface ResumenPeriodo {
  altas: number
  conMedicacion: Record<Momento, number>             // altas con algún fármaco escrito en ese informe
  medias: Record<Momento, Medias>
  conAmbos: number                                    // altas con medicación al ingreso y al alta
  cambioMedio: { farmacos: number; psicofarmacos: number } | null   // alta − ingreso, solo en las que tienen ambos
  polifarmacia: Record<Momento, { cinco: number; diez: number }>     // nº de altas con ≥5 y ≥10 fármacos
  grupos: PorcentajeGrupo[]                           // nº de altas con ≥1 fármaco del grupo
  sinClasificar: { texto: string; n: number }[]       // lo más frecuente que el catálogo no reconoce (y nadie ha marcado)
  dudosos: { texto: string; n: number }[]             // fármacos de uso mixto sin marcar (valproato…): n = veces que aparecen
  conPendientes: Record<Momento, number>              // altas con algún fármaco pendiente de marcar (sin clasificar o de uso mixto)
}

const NINGUNO = { ingreso: 0, alta: 0 }
const MOMENTOS: Momento[] = ['ingreso', 'alta']

export function resumenPeriodo(episodios: EpisodioMed[]): ResumenPeriodo {
  const sumF = { ingreso: 0, alta: 0 }
  const sumP = { ingreso: 0, alta: 0 }
  const con = { ...NINGUNO }
  const poli = { ingreso: { cinco: 0, diez: 0 }, alta: { cinco: 0, diez: 0 } }
  const grupos: PorcentajeGrupo[] = [
    ...GRUPOS_PSICO.map((g) => ({ clave: g.clave as string, etiqueta: g.plural, n: { ...NINGUNO } })),
    { clave: 'benzodiacepinas', etiqueta: 'Benzodiacepinas (incluye clonazepam)', n: { ...NINGUNO } },
    { clave: 'z', etiqueta: 'Fármacos Z (zolpidem, zopiclona…)', n: { ...NINGUNO } },
    { clave: 'antiepilepticos', etiqueta: 'Antiepilépticos (todos; solo cuentan como psicofármaco los marcados «Sí»)', n: { ...NINGUNO } },
  ]
  const porClave = new Map(grupos.map((g) => [g.clave, g]))
  const sinClas = new Map<string, { texto: string; n: number }>()
  const dud = new Map<string, { texto: string; n: number }>()
  const pend = { ...NINGUNO }
  let ambos = 0, difF = 0, difP = 0

  for (const e of episodios) {
    for (const m of MOMENTOS) {
      const r = e[m]
      if (!r) continue
      con[m]++
      sumF[m] += r.total
      sumP[m] += r.psicofarmacos
      if (r.total >= 5) poli[m].cinco++
      if (r.total >= 10) poli[m].diez++
      for (const g of GRUPOS_PSICO) if (r.porGrupo[g.clave as GrupoPsico] > 0) porClave.get(g.clave)!.n[m]++
      if (r.benzodiacepinas > 0) porClave.get('benzodiacepinas')!.n[m]++
      if (r.farmacosZ > 0) porClave.get('z')!.n[m]++
      if (r.antiepilepticos > 0) porClave.get('antiepilepticos')!.n[m]++
      const contar = (mapa: Map<string, { texto: string; n: number }>, textos: string[]) => {
        for (const t of textos) {
          const k = t.toLowerCase().trim()
          const x = mapa.get(k) ?? { texto: t.trim(), n: 0 }
          x.n++
          mapa.set(k, x)
        }
      }
      contar(sinClas, r.sinClasificar)
      contar(dud, r.dudosos)
      if (r.sinClasificar.length + r.dudosos.length > 0) pend[m]++
    }
    if (e.ingreso && e.alta) {
      ambos++
      difF += e.alta.total - e.ingreso.total
      difP += e.alta.psicofarmacos - e.ingreso.psicofarmacos
    }
  }
  const media = (s: number, n: number) => (n > 0 ? s / n : 0)
  return {
    altas: episodios.length,
    conMedicacion: con,
    medias: {
      ingreso: { episodios: con.ingreso, farmacos: media(sumF.ingreso, con.ingreso), psicofarmacos: media(sumP.ingreso, con.ingreso) },
      alta: { episodios: con.alta, farmacos: media(sumF.alta, con.alta), psicofarmacos: media(sumP.alta, con.alta) },
    },
    conAmbos: ambos,
    cambioMedio: ambos > 0 ? { farmacos: difF / ambos, psicofarmacos: difP / ambos } : null,
    polifarmacia: poli,
    grupos,
    sinClasificar: [...sinClas.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto)).slice(0, 12),
    dudosos: [...dud.values()].sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto)).slice(0, 12),
    conPendientes: pend,
  }
}
