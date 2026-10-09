// CIE-10-ES (la clasificación con la que se codifica el CMBD en España; sigue la estructura
// de la ICD-10-CM y NO coincide con la CIE-10 de la OMS: p. ej. no existe F00.1, el Alzheimer
// es G30.1 + F02.8x).
//
// Dos niveles:
//  · FRECUENTES (cie10Frecuentes.ts): lo que más se usa en la unidad (neurología del anciano,
//    psiquiatría geriátrica, geriatría). Está siempre disponible y sale primero al buscar.
//  · CATÁLOGO COMPLETO (public/cie10_es_2026.txt, generado por scripts/generar_cie10.py a partir
//    de la Tabla de Referencia oficial del Ministerio de Sanidad): ~71.500 códigos finales con su
//    descripción oficial. Se descarga solo la primera vez que hace falta (al usar el buscador
//    o al abrir un código que no está en los frecuentes).
//
// Con el catálogo se valida un código (existe / está completo / puede ser principal).
// Cada año, al publicarse la tabla nueva: python3 scripts/generar_cie10.py <tabla.xlsx> <año>.

import { useEffect, useState } from 'react'
import { quitarTildes } from './busqueda'
import { FRECUENTES } from './cie10Frecuentes'

export const ANIO_CIE10 = 2026

// Marcas de un código: M manifestación (nunca principal) · N no puede ser principal · E exento de POAD.
export interface CodigoCIE { code: string; desc: string; marcas?: string; frecuente?: boolean }

interface Entrada extends CodigoCIE {
  codeN: string        // en minúsculas y sin punto: "g301"
  texto: string        // " enfermedad de alzheimer de comienzo tardio alzheimer" (sin tildes, palabras separadas por un espacio)
  alias: string        // alias normalizados (solo frecuentes)
  orden: number        // posición para desempatar: los frecuentes, en el orden en que están escritos; luego el catálogo
}

function normalizarTexto(s: string): string {
  return ' ' + quitarTildes(s.toLowerCase()).split(/[\s,()/.:;-]+/).filter(Boolean).join(' ')
}

function crear(code: string, desc: string, marcas: string, alias: string, frecuente: boolean, orden: number): Entrada {
  const sinCola = desc.replace(/, sin alteración conductual.*$/, '') // evita que "psicótica" encuentre las demencias SIN alteración
  return {
    code, desc, marcas, frecuente,
    codeN: code.toLowerCase().replace('.', ''),
    texto: normalizarTexto(`${sinCola} ${alias}`),
    alias: normalizarTexto(alias),
    orden,
  }
}

const ENTRADAS_FRECUENTES: Entrada[] = FRECUENTES.map(([c, d, a, m], i) => crear(c, d, m, a, true, i))
const POR_CODIGO_FRECUENTE = new Map(ENTRADAS_FRECUENTES.map((e) => [e.code, e]))

// ─── Catálogo completo (carga perezosa) ──────────────────────

let catalogo: Entrada[] | null = null
let porCodigo: Map<string, Entrada> | null = null
let promesa: Promise<void> | null = null
const oyentes = new Set<() => void>()

export function catalogoCIE10Cargado(): boolean { return catalogo !== null }

export function cargarCatalogoCIE10(): Promise<void> {
  if (catalogo) return Promise.resolve()
  if (promesa) return promesa
  const url = `${import.meta.env.BASE_URL}cie10_es_${ANIO_CIE10}.txt`
  promesa = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
    .then((txt) => {
      const lista: Entrada[] = []
      for (const linea of txt.split('\n')) {
        const p = linea.indexOf('|')
        if (p < 1) continue
        const q = linea.indexOf('|', p + 1)
        if (q < 0) continue
        const code = linea.slice(0, p)
        const frecuente = POR_CODIGO_FRECUENTE.get(code)
        // Los frecuentes ya tienen su entrada (con alias); el resto, la del catálogo.
        lista.push(frecuente ?? crear(code, linea.slice(q + 1), linea.slice(p + 1, q), '', false, 1e6 + lista.length))
      }
      if (lista.length < 1000) throw new Error('catálogo CIE-10-ES incompleto')
      catalogo = lista
      porCodigo = new Map(lista.map((e) => [e.code, e]))
      avisos.clear()
      oyentes.forEach((f) => f())
    })
    .catch((e) => { promesa = null; throw e }) // se podrá reintentar
  return promesa
}

// Para que un componente se vuelva a pintar cuando el catálogo termina de cargarse.
// Con `activar` a true, además, lo empieza a descargar.
export function useCatalogoCIE10(activar = true): boolean {
  const [cargado, setCargado] = useState(catalogo !== null)
  useEffect(() => {
    const f = () => setCargado(true)
    oyentes.add(f)
    if (catalogo) setCargado(true)
    else if (activar) cargarCatalogoCIE10().catch(() => { /* sin catálogo se sigue con los frecuentes */ })
    return () => { oyentes.delete(f) }
  }, [activar])
  return cargado
}

// ─── Consulta de un código ───────────────────────────────────

// "g30.1", " G301 " → "G30.1"
export function normalizarCodigo(c: string): string {
  const t = c.trim().toUpperCase()
  return /^[A-Z]\d{2}[A-Z0-9]{1,4}$/.test(t) ? `${t.slice(0, 3)}.${t.slice(3)}` : t
}

export function infoCIE10(code: string): CodigoCIE | null {
  const c = normalizarCodigo(code)
  return POR_CODIGO_FRECUENTE.get(c) ?? porCodigo?.get(c) ?? null
}

export function descripcionCIE10(code: string): string | null {
  return infoCIE10(code)?.desc ?? null
}

// ─── Búsqueda ────────────────────────────────────────────────

function puntuar(e: Entrada, tCodigo: string, palabras: string[], esCodigo: boolean): number {
  let puntos = 0
  if (e.codeN === tCodigo) puntos = 100
  else if (e.codeN.startsWith(tCodigo)) puntos = 80
  else if (e.frecuente && tCodigo.length >= 2 && e.codeN.includes(tCodigo)) puntos = 50
  else if (!esCodigo && palabras.every((p) => e.texto.includes(' ' + p))) {
    puntos = e.alias && palabras.every((p) => e.alias.includes(' ' + p)) ? 30 : 20
  }
  return puntos > 0 && e.frecuente ? puntos + 40 : puntos
}

export function buscarCIE10(q: string, max = 10): CodigoCIE[] {
  const t = quitarTildes(q.trim().toLowerCase())
  if (!t) return []
  const tCodigo = t.replace('.', '')
  const palabras = normalizarTexto(t).trim().split(' ').filter(Boolean)
  if (palabras.length === 0) return []
  // algo como "g30" o "f02.8": solo se busca por código
  const esCodigo = /^[a-z]\d/.test(t)
  const candidatos = catalogo ?? ENTRADAS_FRECUENTES
  const res: { e: Entrada; puntos: number }[] = []
  for (let i = 0; i < candidatos.length; i++) {
    const puntos = puntuar(candidatos[i], tCodigo, palabras, esCodigo)
    if (puntos > 0) res.push({ e: candidatos[i], puntos })
  }
  res.sort((a, b) => b.puntos - a.puntos || a.e.orden - b.e.orden)
  return res.slice(0, max).map(({ e }) => ({ code: e.code, desc: e.desc, marcas: e.marcas, frecuente: e.frecuente }))
}

// ─── Avisos ──────────────────────────────────────────────────

// Códigos de la CIE-10 de la OMS que NO existen (o no así) en la CIE-10-ES, con su
// equivalente, para avisar si alguien los escribe.
const SUSTITUTOS: [RegExp, string][] = [
  [/^F00(\.\d)?$/i, 'Alzheimer: G30.x + F02.8x (demencia en otra enfermedad)'],
  [/^F01\.[0-3]$|^F01\.9$|^F01$/i, 'Demencia vascular: F01.5x'],
  [/^F02\.[0-8]$|^F02$/i, 'Demencia en otra enfermedad: F02.8x (+ código de la enfermedad de base)'],
  [/^F03$/i, 'Demencia no especificada: F03.9x'],
  [/^F05\.\d$/i, 'Delirium: F05'],
  [/^F06\.3$/i, 'Trastorno del ánimo orgánico: F06.30 a F06.34'],
  [/^G31\.0$/i, 'Pick: G31.01 (otras demencias frontotemporales: G31.09)'],
  [/^G20$/i, 'Parkinson: G20.A1, G20.A2, G20.B1, G20.B2 o G20.C'],
  [/^L89\.\d$/i, 'Úlcera por presión: L89.xxx según localización y estadio'],
  [/^I69\.3$/i, 'Secuelas de infarto cerebral: I69.3xx'],
  [/^S72\.0$/i, 'Fractura de cuello de fémur: S72.00x + 7º carácter'],
  [/^W19$/i, 'Caída: W19.XXXA'],
  [/^E78\.0$/i, 'Hipercolesterolemia: E78.00'],
  [/^Z74\.0$/i, 'Movilidad reducida: Z74.09'],
  [/^F41\.2$/i, 'Mixto ansioso-depresivo: F41.8'],
]

const avisos = new Map<string, string | null>()   // caché de avisos de códigos no encontrados (se vacía al cargar el catálogo)

function ejemplos(c: string): string[] {
  const out: string[] = []
  const pref = c.toUpperCase()
  const base = catalogo ?? []
  for (const e of base) {
    if (e.code.startsWith(pref)) { out.push(e.code); if (out.length === 3) break }
  }
  return out
}

// Aviso para un código escrito: null si es correcto o no hay nada que decir.
// `principal`: es el diagnóstico principal (hay códigos que no pueden serlo).
export function avisoCodigoCIE10(code: string, opciones: { principal?: boolean } = {}): string | null {
  const t = code.trim()
  if (!t) return null
  const info = infoCIE10(t)
  if (info) {
    if (opciones.principal) {
      if (info.marcas?.includes('M')) return 'Es un código de manifestación: no puede ser el diagnóstico principal. Codifica antes la enfermedad de base.'
      if (info.marcas?.includes('N')) return 'Este código no puede ser el diagnóstico principal (solo como secundario).'
    }
    return null
  }
  const clave = normalizarCodigo(t)
  const sust = SUSTITUTOS.find(([re]) => re.test(clave))
  if (!catalogo) {
    // Sin catálogo solo se avisa de lo que se sabe seguro que está mal.
    return sust ? `No es un código válido en la CIE-10-ES. ${sust[1]}` : null
  }
  if (avisos.has(clave)) return avisos.get(clave) ?? null
  let aviso: string
  const ej = ejemplos(clave)
  if (ej.length > 0) aviso = `Código incompleto: faltan caracteres (p. ej. ${ej.join(', ')}). Elige uno de la lista.`
  else if (sust) aviso = `No es un código válido en la CIE-10-ES. ${sust[1]}`
  else aviso = `Este código no existe en la CIE-10-ES ${ANIO_CIE10}. Compruébalo.`
  avisos.set(clave, aviso)
  return aviso
}
