// Datos de la ficha que se pueden volcar en un informe puntual. Aquí se
// leen y se convierten a texto; nada de esto se escribe de vuelta en la
// ficha. Cada "origen" (ver ORIGEN_LABEL) produce un texto que el médico
// puede editar después a su gusto.

import { supabase } from '../../lib/supabase'
import { diasEntre } from '../../lib/fechas'
import type { FilaMedicacion, Ingreso, InformeAlta, InformeIngreso, ItemsPaciente } from '../../types'
import type { EscalaClinica } from '../../types/escalas'
import { TOMAS } from '../ingreso/TablaMedicacion'
import { CARACTERISTICA_LABEL, GRADO_LABEL, fechaLarga, ordenarValoraciones, textoPauta, pautaVigente } from '../curas/tipos'
import type { Lesion } from '../curas/tipos'

type FilaCmbd = Record<string, string | number | boolean | null | undefined>

export interface DatosFicha {
  ingreso: Ingreso
  informeIngreso: Partial<InformeIngreso> | null
  informeAlta: Partial<InformeAlta> | null
  escalaIngreso: EscalaClinica | null
  escalaAlta: EscalaClinica | null
  cmbd: FilaCmbd | null
  items: Partial<ItemsPaciente> | null
  lesiones: Lesion[]
}

export interface TextoOrigen {
  texto: string
  // Aviso para el médico sobre la fiabilidad/actualidad del dato.
  nota?: string
}

export async function cargarDatosFicha(ingreso: Ingreso): Promise<DatosFicha> {
  const id = ingreso.id
  const [ii, ia, ei, ea, cm, it, le] = await Promise.all([
    supabase.from('informe_ingreso').select('*').eq('ingreso_id', id).maybeSingle(),
    supabase.from('informe_alta').select('*').eq('ingreso_id', id).maybeSingle(),
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', id).eq('momento', 'ingreso').maybeSingle(),
    supabase.from('escalas_clinicas').select('*').eq('ingreso_id', id).eq('momento', 'alta').maybeSingle(),
    supabase.from('cmbd').select('*').eq('ingreso_id', id).maybeSingle(),
    supabase.from('items_paciente').select('*').eq('ingreso_id', id).maybeSingle(),
    supabase.from('curas_lesiones').select('*, valoraciones:curas_valoraciones(*)').eq('ingreso_id', id).is('fecha_fin', null),
  ])
  return {
    ingreso,
    informeIngreso: (ii.data as Partial<InformeIngreso>) ?? null,
    informeAlta: (ia.data as Partial<InformeAlta>) ?? null,
    escalaIngreso: (ei.data as EscalaClinica) ?? null,
    escalaAlta: (ea.data as EscalaClinica) ?? null,
    cmbd: (cm.data as FilaCmbd) ?? null,
    items: (it.data as Partial<ItemsPaciente>) ?? null,
    lesiones: ((le.data as Lesion[]) ?? []),
  }
}

// ── Formateadores (puros) ───────────────────────────────────────

const limpio = (s?: string | null) => (s ?? '').trim()

function lineas(...partes: (string | false | null | undefined)[]): string {
  return partes.filter((p): p is string => !!p && p.trim() !== '').join('\n')
}

export function textoMedicacion(filas: FilaMedicacion[] | null | undefined): string {
  return (filas ?? [])
    .filter((f) => limpio(f.farmaco))
    .map((f) => {
      const tomas = TOMAS
        .map((t) => (limpio(f[t.key]) ? `${t.label.toLowerCase()} ${limpio(f[t.key])}` : ''))
        .filter(Boolean)
        .join(', ')
      return `${limpio(f.farmaco)}${limpio(f.dosis) ? ' ' + limpio(f.dosis) : ''}${tomas ? ` (${tomas})` : ''}${limpio(f.observaciones) ? ` — ${limpio(f.observaciones)}` : ''}`
    })
    .join('\n')
}

function resumenEscala(e: EscalaClinica | null): string {
  if (!e) return ''
  const p: string[] = []
  if (e.barthel_total != null) p.push(`Barthel ${e.barthel_total}/100`)
  if (e.lawton_total != null) p.push(`Lawton ${e.lawton_total}/8`)
  if (e.npi_gravedad_total != null) p.push(`NPI-Q (gravedad) ${e.npi_gravedad_total}/36`)
  if (e.gds_estadio) p.push(`GDS ${e.gds_estadio}`)
  if (e.fast_estadio) p.push(`FAST ${e.fast_estadio}`)
  return p.join(' · ')
}

export function textoEscalas(ingreso: EscalaClinica | null, alta: EscalaClinica | null): string {
  const a = resumenEscala(alta)
  const i = resumenEscala(ingreso)
  return lineas(a && `Al alta: ${a}`, i && `Al ingreso: ${i}`)
}

const DEAMBULACION: Record<string, string> = { autonomo: 'autónomo', '1_persona': 'con ayuda de 1 persona', '2_personas': 'con ayuda de 2 personas' }
const AYUDAS: Record<string, string> = { ninguna: '', baston: 'bastón', andador_2r: 'andador de 2 ruedas', andador_4r: 'andador de 4 ruedas', silla_ruedas: 'silla de ruedas' }
const AUTONOMO_DEP: Record<string, string> = { autonomo: 'autónomo', dependiente: 'dependiente' }
const DENTADURA: Record<string, string> = { ninguna: '', superior: 'superior', inferior: 'inferior', completa: 'completa', fija: 'fija', puente: 'puente' }
const AUDIFONOS: Record<string, string> = { ninguno: '', derecho: 'oído derecho', izquierdo: 'oído izquierdo', ambos: 'ambos oídos' }
const GAFAS: Record<string, string> = { no: '', si: 'sí', solo_tv: 'solo para la televisión' }

export function textoAutonomia(it: Partial<ItemsPaciente> | null): string {
  if (!it) return ''
  const deamb = it.deambulacion
    ? `Deambulación: ${DEAMBULACION[it.deambulacion] ?? it.deambulacion}${it.ayudas_deambulacion && AYUDAS[it.ayudas_deambulacion] ? ` (${AYUDAS[it.ayudas_deambulacion]})` : ''}`
    : it.ayudas_deambulacion && AYUDAS[it.ayudas_deambulacion] ? `Ayuda para caminar: ${AYUDAS[it.ayudas_deambulacion]}` : ''
  const basicas = [
    it.ingestas && `ingesta ${AUTONOMO_DEP[it.ingestas] ?? it.ingestas}`,
    it.higiene && `higiene en ${it.higiene === 'cama' ? 'cama' : 'lavabo'}`,
    it.vestido && `vestido ${AUTONOMO_DEP[it.vestido] ?? it.vestido}`,
    it.ducha && `ducha ${it.ducha === 'sentado' ? 'sentado' : 'de pie'}`,
  ].filter(Boolean).join('; ')
  const panial = [
    it.panial_dia && it.panial_dia !== 'ninguno' && `día ${it.panial_dia}`,
    it.panial_noche && it.panial_noche !== 'ninguno' && `noche ${it.panial_noche === 'CA+malla' ? 'CA + malla' : it.panial_noche}`,
  ].filter(Boolean).join(', ')
  const continencia = [
    panial && `usa pañal (${panial})`,
    it.colector && 'colector',
    it.sonda_vesical && 'sonda vesical',
  ].filter(Boolean).join('; ')
  const apoyos = [
    it.dentadura && DENTADURA[it.dentadura] && `dentadura ${DENTADURA[it.dentadura]}`,
    it.audifonos && AUDIFONOS[it.audifonos] && `audífonos en ${AUDIFONOS[it.audifonos]}`,
    it.gafas && GAFAS[it.gafas] && `gafas ${GAFAS[it.gafas]}`,
  ].filter(Boolean).join('; ')
  const medios = [
    it.grua && 'grúa', it.bipedestador && 'bipedestador', it.cambios_posturales && 'cambios posturales',
    it.oxigenoterapia && 'oxigenoterapia', it.colchon_antiescaras && 'colchón antiescaras',
    it.cabecero_grados && `cabecero a ${it.cabecero_grados}º`,
  ].filter(Boolean).join(', ')
  return lineas(
    it.dependencia_avd && `Dependencia para las actividades básicas: ${it.dependencia_avd === 2 ? '2 personas' : '1 persona'}`,
    deamb,
    basicas && basicas.charAt(0).toUpperCase() + basicas.slice(1),
    continencia && `Continencia: ${continencia}`,
    apoyos && `Productos de apoyo: ${apoyos}`,
    medios && `Medios y cuidados: ${medios}`,
    limpio(it.observaciones) && `Observaciones: ${limpio(it.observaciones)}`,
  )
}

const ALERTAS: Record<string, string> = {
  riesgo_autolitico: 'riesgo autolítico',
  agresion_imprevisible: 'agresión imprevisible',
  riesgo_fuga: 'riesgo de fuga',
}

export function textoAlertas(it: Partial<ItemsPaciente> | null): string {
  if (!it) return ''
  const alertas = (it.alerta_conducta ?? []).map((a) => ALERTAS[a] ?? a)
  return lineas(
    alertas.length > 0 && `Alertas: ${alertas.join(', ')}`,
    limpio(it.objetos_calma) && `Objetos de calma: ${limpio(it.objetos_calma)}`,
  )
}

export function textoCuras(lesiones: Lesion[]): string {
  return lesiones
    .filter((l) => !l.fecha_fin)
    .map((l) => {
      const vals = ordenarValoraciones(l.valoraciones ?? [])
      const ult = vals[0]
      const detalle = [
        ult?.grado && (GRADO_LABEL[ult.grado] ?? ult.grado),
        ult?.medidas && `${ult.medidas} cm`,
      ].filter(Boolean).join(', ')
      const pauta = pautaVigente(l.valoraciones ?? [])
      return `${CARACTERISTICA_LABEL[l.caracteristicas] ?? l.caracteristicas} — ${l.localizacion}${detalle ? ` (${detalle})` : ''}. Cura: ${textoPauta(pauta)}.`
    })
    .join('\n')
}

export function textoDiagnosticos(cmbd: FilaCmbd | null, impresion?: string | null): TextoOrigen {
  const dx = (cod: unknown, desc: unknown) => (cod ? (desc ? `${cod} — ${desc}` : String(cod)) : '')
  const out: string[] = []
  if (cmbd) {
    const p = dx(cmbd.diagnostico_principal, cmbd.diagnostico_principal_desc)
    if (p) out.push(`Principal: ${p}`)
    for (let n = 1; n <= 8; n++) {
      const s = dx(cmbd[`diagnostico_secundario_${n}`], cmbd[`diagnostico_secundario_${n}_desc`])
      if (s) out.push(`Secundario: ${s}`)
    }
  }
  if (out.length > 0) return { texto: out.join('\n') }
  if (limpio(impresion)) {
    return { texto: limpio(impresion), nota: 'El CMBD aún no tiene diagnósticos: se ha usado la impresión diagnóstica del informe de ingreso.' }
  }
  return { texto: '' }
}

// Devuelve el texto de un origen. Texto vacío = no hay dato en la ficha
// (en ese caso la pantalla avisa y no pisa lo que hubiera escrito).
export function textoDeOrigen(origen: string, d: DatosFicha): TextoOrigen {
  const ii = d.informeIngreso
  const p = d.ingreso.paciente
  switch (origen) {
    case 'datos_ingreso': {
      const dias = diasEntre(d.ingreso.fecha_ingreso, d.ingreso.fecha_alta ?? null)
      return {
        texto: lineas(
          `Ingreso en la Unidad de Hospitalización el ${fechaLarga(d.ingreso.fecha_ingreso)}${limpio(d.ingreso.motivo_ingreso) ? `, por ${limpio(d.ingreso.motivo_ingreso).toLowerCase()}` : ''}.`,
          d.ingreso.fecha_alta
            ? `Alta el ${fechaLarga(d.ingreso.fecha_alta)} (estancia de ${dias} días).`
            : dias != null && `Estancia hasta hoy: ${dias} días.`,
        ),
      }
    }
    case 'diagnosticos':
      return textoDiagnosticos(d.cmbd, ii?.impresion_diagnostica)
    case 'impresion':
      return { texto: limpio(ii?.impresion_diagnostica) }
    case 'antecedentes':
      return {
        texto: lineas(
          limpio(ii?.antecedentes_medicos) && `Médicos: ${limpio(ii?.antecedentes_medicos)}`,
          limpio(ii?.antecedentes_quirurgicos) && `Quirúrgicos: ${limpio(ii?.antecedentes_quirurgicos)}`,
        ),
      }
    case 'alergias':
      return { texto: limpio(ii?.alergias) }
    case 'medicacion': {
      const alta = textoMedicacion(d.informeAlta?.medicacion_estructurada)
      if (alta) return { texto: alta, nota: 'Procede de la medicación registrada en el informe de alta. Revísala: comprueba que es la pauta de hoy.' }
      const ing = textoMedicacion(ii?.tratamiento_ingreso_estructurado)
      return ing
        ? { texto: ing, nota: 'Procede del tratamiento al ingreso: puede no coincidir con la pauta actual. Revísala antes de firmar.' }
        : { texto: '' }
    }
    case 'escalas':
      return {
        texto: textoEscalas(d.escalaIngreso, d.escalaAlta),
        nota: 'Son las últimas mediciones registradas en la ficha (ingreso y, si existe, alta).',
      }
    case 'autonomia':
      return { texto: textoAutonomia(d.items), nota: 'Procede de la Hoja de ítems (estado actual de la ficha).' }
    case 'alerta_conducta':
      return { texto: textoAlertas(d.items) }
    case 'curas':
      return { texto: textoCuras(d.lesiones) }
    case 'situacion':
      return {
        texto: lineas(
          limpio(ii?.situacion_cognitivo) && `Cognitivo: ${limpio(ii?.situacion_cognitivo)}`,
          limpio(ii?.situacion_conductual) && `Conductual: ${limpio(ii?.situacion_conductual)}`,
          limpio(ii?.situacion_animico) && `Anímico: ${limpio(ii?.situacion_animico)}`,
          limpio(ii?.situacion_funcional) && `Funcional: ${limpio(ii?.situacion_funcional)}`,
        ),
        nota: 'Son los datos de la valoración al INGRESO: actualízalos con la situación de hoy.',
      }
    case 'social':
      return {
        texto: lineas(limpio(ii?.vgi_social), limpio(ii?.situacion_social) !== limpio(ii?.vgi_social) && limpio(ii?.situacion_social)),
        nota: 'Procede de la valoración social del informe de ingreso: actualízala si ha cambiado.',
      }
    case 'contacto':
      return {
        texto: lineas(
          limpio(p?.contacto_familiar_nombre) && `Familiar de contacto: ${limpio(p?.contacto_familiar_nombre)}`,
          limpio(p?.contacto_familiar_telefono) && `Teléfono: ${limpio(p?.contacto_familiar_telefono)}`,
        ),
      }
    default:
      return { texto: '' }
  }
}
