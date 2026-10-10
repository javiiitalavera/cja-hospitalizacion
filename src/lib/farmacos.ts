// Catálogo de fármacos con su código ATC, para saber cuántos fármacos toma un paciente y
// cuáles son psicofármacos.
//
//  · El catálogo es src/lib/farmacos_atc.txt (principios activos en español con su código ATC y
//    sus marcas más habituales). Se carga la primera vez que hace falta. Para añadir un fármaco:
//    una línea nueva en ese fichero (ATC|Nombre|marca1,marca2|*) y python3 scripts/validar_farmacos.py
//    (el * final marca los de uso muy habitual, que salen primero al buscar).
//  · Cada fila de medicación guarda, además del texto, el código ATC del fármaco elegido. Si la fila
//    es antigua o se escribió a mano, se intenta reconocer el nombre (o la marca) al leerla.
//  · PSICOFÁRMACO = grupos ATC N05 (antipsicóticos, litio, ansiolíticos, hipnóticos y sedantes) y
//    N06 (antidepresivos, psicoestimulantes y nootrópicos, antidemencia). Los antiepilépticos (N03)
//    se cuentan aparte: sirven para la epilepsia y para la conducta, y el catálogo no sabe para cuál.
//    Los de uso mixto (valproato, carbamazepina, lamotrigina, pregabalina, gabapentina…) quedan
//    "pendientes" hasta que el médico los marca a mano como psicofármaco (Sí) o no (No); esa marca
//    (campo `psico` de la fila) manda sobre el catálogo. Lo que no se reconoce también se puede marcar.

import { useEffect, useState } from 'react'
import { quitarTildes } from './busqueda'
import { supabase } from './supabase'

// ─── Grupos ──────────────────────────────────────────────────

export type GrupoPsico =
  | 'antipsicotico' | 'litio' | 'ansiolitico' | 'hipnotico' | 'antidepresivo' | 'psicoestimulante' | 'antidemencia'
  | 'estabilizador' | 'otro'

export const GRUPOS_PSICO: { clave: GrupoPsico; etiqueta: string; plural: string }[] = [
  { clave: 'antipsicotico', etiqueta: 'Antipsicótico', plural: 'Antipsicóticos' },
  { clave: 'litio', etiqueta: 'Litio', plural: 'Litio' },
  { clave: 'ansiolitico', etiqueta: 'Ansiolítico', plural: 'Ansiolíticos' },
  { clave: 'hipnotico', etiqueta: 'Hipnótico / sedante', plural: 'Hipnóticos y sedantes' },
  { clave: 'antidepresivo', etiqueta: 'Antidepresivo', plural: 'Antidepresivos' },
  { clave: 'psicoestimulante', etiqueta: 'Psicoestimulante / nootrópico', plural: 'Psicoestimulantes y nootrópicos' },
  { clave: 'antidemencia', etiqueta: 'Antidemencia', plural: 'Antidemencia' },
  // Solo salen cuando el médico marca a mano un fármaco como psicofármaco:
  { clave: 'estabilizador', etiqueta: 'Estabilizador del ánimo', plural: 'Estabilizadores del ánimo (antiepilépticos o gabapentinoides marcados a mano)' },
  { clave: 'otro', etiqueta: 'Psicofármaco (marcado a mano)', plural: 'Otros psicofármacos marcados a mano' },
]

export function grupoPsico(atc: string | null | undefined): GrupoPsico | null {
  if (!atc) return null
  const a = atc.toUpperCase()
  if (a.startsWith('N05AN')) return 'litio'
  if (a.startsWith('N05A')) return 'antipsicotico'
  if (a.startsWith('N05B')) return 'ansiolitico'
  if (a.startsWith('N05C')) return 'hipnotico'
  if (a.startsWith('N06A')) return 'antidepresivo'
  if (a.startsWith('N06B')) return 'psicoestimulante'
  if (a.startsWith('N06D')) return 'antidemencia'
  return null
}

export const esPsicofarmaco = (atc: string | null | undefined) => grupoPsico(atc) !== null
// Benzodiacepinas: ansiolíticas (N05BA), hipnóticas (N05CD) y clonazepam (antiepiléptico, N03AE).
export const esBenzodiacepina = (atc: string | null | undefined) => !!atc && /^(N05BA|N05CD|N03AE)/i.test(atc)
// Fármacos "Z" (zolpidem, zopiclona, zaleplón, eszopiclona).
export const esFarmacoZ = (atc: string | null | undefined) => !!atc && /^N05CF/i.test(atc)
export const esAntiepileptico = (atc: string | null | undefined) => !!atc && /^N03/i.test(atc)

// ─── Texto ───────────────────────────────────────────────────

function normalizar(s: string): string {
  return quitarTildes(s.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()
}

// Palabras que acompañan al nombre en una fila y no son parte de él.
const RUIDO = new Set([
  'mg', 'g', 'mcg', 'ug', 'ml', 'ui', 'meq', 'comp', 'comprimido', 'comprimidos', 'capsula', 'capsulas', 'cap', 'caps',
  'gotas', 'gts', 'amp', 'ampolla', 'sobre', 'sobres', 'parche', 'parches', 'jarabe', 'solucion', 'inyectable',
  'im', 'iv', 'sc', 'vo', 'cada', 'h', 'horas', 'dia', 'dias', 'de', 'del', 'la', 'el', 'por', 'en', 'y', 'tab', 'tabletas',
  'efg', 'oral', 'retard', 'lp', 'sr', 'xr', 'flas', 'bucodispersable', 'masticable', 'ayunas', 'noche', 'precisa',
])

// ─── Catálogo (carga perezosa) ───────────────────────────────

// comun: de uso muy habitual (sale antes al buscar) · mixto: según para qué se use es o no psicofármaco
// componentes: en una combinación (p. ej. donepezilo + memantina), el ATC de cada principio activo: así cuenta como dos fármacos
export interface Farmaco { atc: string; nombre: string; marcas: string[]; comun?: boolean; mixto?: boolean; componentes?: string[] }

interface Entrada extends Farmaco { claves: string[] }

let catalogo: Entrada[] | null = null
let porClave: Map<string, Entrada> | null = null
let porAtc: Map<string, Entrada> | null = null
let promesa: Promise<void> | null = null
const oyentes = new Set<() => void>()

export function catalogoFarmacosCargado(): boolean { return catalogo !== null }

export function parsearCatalogo(txt: string): Entrada[] {
  const lista: Entrada[] = []
  for (const linea of txt.split('\n')) {
    if (!linea.trim() || linea.startsWith('#')) continue
    const p = linea.split('|')
    if (p.length < 2 || !p[0].trim() || !p[1].trim()) continue
    const marcas = (p[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const nombre = p[1].trim()
    const componentes = (p[4] ?? '').split('+').map((s) => s.trim().toUpperCase()).filter(Boolean)
    lista.push({
      atc: p[0].trim().toUpperCase(), nombre, marcas, comun: (p[3] ?? '').includes('*'), mixto: (p[3] ?? '').includes('?'),
      componentes: componentes.length > 1 ? componentes : undefined,
      claves: [nombre, ...marcas].map(normalizar).filter(Boolean),
    })
  }
  return lista
}

// Marcas que el equipo ha ido enseñando a la app (tabla farmacos_alias): «ketyalix» → quetiapina, etc.
export interface AliasFarmaco { clave: string; atc: string }

function anadirAlias(a: AliasFarmaco): boolean {
  if (!catalogo || !porClave || !porAtc) return false
  const clave = normalizar(a.clave)
  const e = porAtc.get(a.atc.toUpperCase())
  if (!clave || !e || porClave.has(clave)) return false
  e.claves.push(clave)
  e.marcas.push(a.clave.trim())
  porClave.set(clave, e)
  return true
}

export function instalarCatalogo(lista: Entrada[], alias: AliasFarmaco[] = []) {
  catalogo = lista
  porClave = new Map()
  porAtc = new Map()
  for (const e of lista) {
    if (!porAtc.has(e.atc)) porAtc.set(e.atc, e)
    for (const k of e.claves) if (!porClave.has(k)) porClave.set(k, e)
  }
  for (const a of alias) anadirAlias(a)
  oyentes.forEach((f) => f())
}

// Si la tabla de marcas aprendidas no existe todavía (o falla), el catálogo funciona igual sin ellas.
async function cargarAlias(): Promise<AliasFarmaco[]> {
  try {
    const { data, error } = await supabase.from('farmacos_alias').select('clave, atc')
    if (error || !data) return []
    return data as AliasFarmaco[]
  } catch { return [] }
}

export function cargarCatalogoFarmacos(): Promise<void> {
  if (catalogo) return Promise.resolve()
  if (promesa) return promesa
  promesa = Promise.all([import('./farmacos_atc.txt?raw'), cargarAlias()])
    .then(([m, alias]) => {
      const lista = parsearCatalogo(m.default)
      if (lista.length < 100) throw new Error('catálogo de fármacos incompleto')
      instalarCatalogo(lista, alias)
    })
    .catch((e) => { promesa = null; throw e })
  return promesa
}

// Repinta el componente cuando el catálogo termina de cargar. Con `activar` también empieza a cargarlo.
export function useCatalogoFarmacos(activar = true): boolean {
  const [cargado, setCargado] = useState(catalogo !== null)
  useEffect(() => {
    const f = () => setCargado(true)
    oyentes.add(f)
    if (catalogo) setCargado(true)
    else if (activar) cargarCatalogoFarmacos().catch(() => { /* sin catálogo, los fármacos quedan "sin clasificar" */ })
    return () => { oyentes.delete(f) }
  }, [activar])
  return cargado
}

// ─── Reconocer un fármaco a partir de lo escrito ─────────────

export function clasificarTexto(texto: string | null | undefined): Farmaco | null {
  if (!porClave || !texto) return null
  const n = normalizar(texto)
  if (!n) return null
  const exacto = porClave.get(n)
  if (exacto) return exacto
  // "Quetiapina 25 mg 1-0-1", "Tab. Seroquel": se quitan dosis y palabras de relleno y se busca
  // la secuencia de palabras más larga que sea un nombre o una marca conocidos.
  const palabras = n.split(' ').filter((w) => !/^\d/.test(w) && !RUIDO.has(w))
  for (let len = Math.min(palabras.length, 4); len >= 1; len--) {
    for (let ini = 0; ini + len <= palabras.length; ini++) {
      const hit = porClave.get(palabras.slice(ini, ini + len).join(' '))
      if (hit) return hit
    }
  }
  return null
}

export function farmacoPorAtc(atc: string | null | undefined): Farmaco | null {
  return (atc && porAtc?.get(atc.toUpperCase())) || null
}

// Lo que se recuerda de un texto como «Ketyalix 50 mg 1-0-1»: el nombre sin dosis ni palabras de relleno («ketyalix»).
export function claveDeAlias(texto: string): string {
  return normalizar(texto).split(' ').filter((w) => !/^\d/.test(w) && !RUIDO.has(w)).slice(0, 4).join(' ')
}

// Enseña a la app que este nombre (una marca que no conocía) es el principio activo `atc`, para todos y para siempre.
// Solo médicos y administración pueden guardarlo; a los demás les sirve solo en esa fila.
export async function recordarMarca(texto: string, atc: string): Promise<{ guardada: boolean; clave: string; error?: string }> {
  const clave = claveDeAlias(texto)
  if (clave.length < 3) return { guardada: false, clave, error: 'El nombre es demasiado corto para recordarlo.' }
  let error: { message: string } | null = null
  try {
    ;({ error } = await supabase.from('farmacos_alias').upsert({ clave, atc: atc.toUpperCase() }, { onConflict: 'clave' }))
  } catch (e) { error = { message: e instanceof Error ? e.message : 'No se pudo guardar.' } }
  if (error) return { guardada: false, clave, error: error.message }
  anadirAlias({ clave, atc })
  oyentes.forEach((f) => f())
  return { guardada: true, clave }
}

// ─── Buscador ────────────────────────────────────────────────

export interface ResultadoFarmaco { farmaco: Farmaco; via?: string }   // `via`: la marca que coincidió

export function buscarFarmacos(consulta: string, max = 8): ResultadoFarmaco[] {
  if (!catalogo) return []
  const q = normalizar(consulta)
  if (q.length < 2) return []
  const res: { e: Entrada; score: number; via?: string }[] = []
  for (const e of catalogo) {
    let mejor = 0
    let via: string | undefined
    e.claves.forEach((k, i) => {
      const esNombre = i === 0
      let s = 0
      if (k === q) s = 120
      else if (k.startsWith(q)) s = esNombre ? 100 : 90
      else if (k.split(' ').some((w) => w.startsWith(q))) s = esNombre ? 70 : 60
      else if (q.length >= 4 && k.includes(q)) s = esNombre ? 40 : 30
      if (s > mejor) { mejor = s; via = esNombre ? undefined : e.marcas[i - 1] }
    })
    if (mejor > 0) res.push({ e, score: mejor + (e.comun ? 8 : 0), via })
  }
  return res
    .sort((a, b) => b.score - a.score || a.e.nombre.length - b.e.nombre.length || a.e.nombre.localeCompare(b.e.nombre))
    .slice(0, max)
    .map((r) => ({ farmaco: r.e, via: r.via }))
}

// ─── Resumen de la medicación de un paciente ─────────────────

export type MarcaPsico = 'si' | 'no' | null | undefined
interface FilaConFarmaco { farmaco?: string | null; atc?: string | null; psico?: MarcaPsico }

export function atcDeFila(f: FilaConFarmaco): string | null {
  if (f.atc) return f.atc.toUpperCase()
  return clasificarTexto(f.farmaco)?.atc ?? null
}

// ¿Hay que (o se puede) marcar a mano? Solo en tres casos: fármacos de uso mixto (valproato…), fármacos
// que el catálogo no reconoce, y los que ya llevan marca (para poder quitarla). Un omeprazol o un
// adiro no preguntan nada.
export function admiteMarcaPsico(f: FilaConFarmaco): boolean {
  if (!(f.farmaco ?? '').trim()) return false
  if (f.psico) return true
  const atc = atcDeFila(f)
  if (!atc) return true
  return !grupoPsico(atc) && !!farmacoPorAtc(atc)?.mixto
}

export type EstadoPsico = 'psico' | 'no_psico' | 'dudoso'

// Cómo cuenta un fármaco: la marca manual manda; si no, el grupo ATC (N05/N06 = psicofármaco);
// si es de uso mixto (p. ej. valproato) queda "dudoso" hasta que alguien lo marque; el resto, no.
export function estadoPsico(f: FilaConFarmaco): EstadoPsico {
  if (f.psico === 'si') return 'psico'
  if (f.psico === 'no') return 'no_psico'
  const atc = atcDeFila(f)
  if (!atc) return 'no_psico'
  if (grupoPsico(atc)) return 'psico'
  return farmacoPorAtc(atc)?.mixto ? 'dudoso' : 'no_psico'
}

// Grupo con el que se cuenta un psicofármaco (si se marcó a mano un N03/N02BF → estabilizador).
export function grupoDeFila(f: FilaConFarmaco): GrupoPsico | null {
  if (estadoPsico(f) !== 'psico') return null
  const atc = atcDeFila(f)
  const g = grupoPsico(atc)
  if (g) return g
  if (atc && /^(N03|N02BF)/i.test(atc)) return 'estabilizador'
  return 'otro'
}

export interface ResumenMedicacion {
  total: number                              // principios activos distintos
  sinClasificar: string[]                    // textos que no se reconocen ni se han marcado a mano
  dudosos: string[]                          // de uso mixto (p. ej. valproato) todavía sin marcar
  psicofarmacos: number
  porGrupo: Record<GrupoPsico, number>
  benzodiacepinas: number
  farmacosZ: number
  antiepilepticos: number
  nombresPsico: string[]
}

export function resumirMedicacion(filas: FilaConFarmaco[] | null | undefined): ResumenMedicacion {
  const porGrupo = Object.fromEntries(GRUPOS_PSICO.map((g) => [g.clave, 0])) as Record<GrupoPsico, number>
  const vistos = new Map<string, { texto: string; fila: FilaConFarmaco }>()
  const r: ResumenMedicacion = {
    total: 0, sinClasificar: [], dudosos: [], psicofarmacos: 0, porGrupo, benzodiacepinas: 0, farmacosZ: 0, antiepilepticos: 0, nombresPsico: [],
  }
  // Una combinación (Domex = donepezilo + memantina) cuenta como un fármaco por cada principio activo.
  const items: FilaConFarmaco[] = []
  for (const f of filas ?? []) {
    if (!(f.farmaco ?? '').trim()) continue
    const comps = farmacoPorAtc(atcDeFila(f))?.componentes
    if (comps) for (const c of comps) items.push({ farmaco: farmacoPorAtc(c)?.nombre ?? c, atc: c, psico: f.psico })
    else items.push(f)
  }
  for (const f of items) {
    const texto = (f.farmaco ?? '').trim()
    const atc = atcDeFila(f)
    const clave = atc ? `atc:${atc}:${normalizar(farmacoPorAtc(atc)?.nombre ?? texto)}` : `txt:${normalizar(texto)}`
    const previo = vistos.get(clave)
    if (!previo) vistos.set(clave, { texto, fila: f })
    else if (!previo.fila.psico && f.psico) previo.fila = f      // si el mismo fármaco sale dos veces, vale la marca que exista
  }
  for (const { texto, fila } of vistos.values()) {
    r.total++
    const atc = atcDeFila(fila)
    const estado = estadoPsico(fila)
    const nombre = (atc && farmacoPorAtc(atc)?.nombre) || texto
    if (!atc && !fila.psico) r.sinClasificar.push(texto)
    if (estado === 'dudoso') r.dudosos.push(nombre)
    if (estado === 'psico') {
      r.psicofarmacos++
      porGrupo[grupoDeFila(fila)!]++
      r.nombresPsico.push(nombre)
    }
    if (atc) {
      if (esBenzodiacepina(atc)) r.benzodiacepinas++
      if (esFarmacoZ(atc)) r.farmacosZ++
      if (esAntiepileptico(atc)) r.antiepilepticos++
    }
  }
  return r
}

// "2 antipsicóticos, 1 antidepresivo": para los contadores.
export function textoGrupos(r: ResumenMedicacion): string {
  return GRUPOS_PSICO
    .filter((g) => r.porGrupo[g.clave] > 0)
    .map((g) => `${r.porGrupo[g.clave]} ${r.porGrupo[g.clave] === 1 ? g.etiqueta.toLowerCase() : g.plural.toLowerCase()}`)
    .join(', ')
}
