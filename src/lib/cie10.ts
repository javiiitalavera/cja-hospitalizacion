// Repertorio CIE-10-ES (diagnósticos) de uso frecuente en la unidad: neurología del
// anciano, psiquiatría geriátrica y geriatría. El CMBD se codifica con la CIE-10-ES
// del Ministerio de Sanidad (edición vigente), cuyos códigos siguen la estructura de
// la ICD-10-CM: NO coinciden con los de la CIE-10 de la OMS (p. ej. no existe F00.1:
// el Alzheimer es G30.1 + F02.8x).
//
// Esto es un repertorio ORIENTATIVO para buscar rápido, no la clasificación completa:
// cualquier código se puede escribir a mano, y los que no estén aquí salen marcados
// para comprobarlos. Antes de enviar un CMBD, validar con Codificación o con la Tabla
// de Referencia CIE-10-ES del Ministerio.

import { quitarTildes } from './busqueda'

export interface CodigoCIE { code: string; desc: string; alias?: string }

// [código, descripción, alias de búsqueda]
type Fila = [string, string, string?]

const BASE: Fila[] = [
  // ── Enfermedad de Alzheimer y otras enfermedades neurodegenerativas ──
  ['G30.0', 'Enfermedad de Alzheimer de inicio precoz', 'alzheimer'],
  ['G30.1', 'Enfermedad de Alzheimer de inicio tardío', 'alzheimer'],
  ['G30.8', 'Otros tipos de enfermedad de Alzheimer', 'alzheimer'],
  ['G30.9', 'Enfermedad de Alzheimer, no especificada', 'alzheimer'],
  ['G31.01', 'Enfermedad de Pick', 'demencia frontotemporal'],
  ['G31.09', 'Otras demencias frontotemporales', 'DFT'],
  ['G31.83', 'Trastorno neurocognitivo con cuerpos de Lewy', 'demencia cuerpos de lewy DCL'],
  ['G31.84', 'Deterioro cognitivo leve, así descrito', 'DCL leve'],
  ['G31.85', 'Degeneración corticobasal', 'DCB'],
  ['G31.1', 'Degeneración cerebral senil, no clasificada bajo otro concepto'],
  ['G31.89', 'Otras enfermedades degenerativas especificadas del sistema nervioso'],
  ['G31.9', 'Enfermedad degenerativa del sistema nervioso, no especificada'],
  ['G20.A1', 'Enfermedad de Parkinson sin discinesia, sin fluctuaciones', 'parkinson'],
  ['G20.A2', 'Enfermedad de Parkinson sin discinesia, con fluctuaciones', 'parkinson'],
  ['G20.B1', 'Enfermedad de Parkinson con discinesia, sin fluctuaciones', 'parkinson'],
  ['G20.B2', 'Enfermedad de Parkinson con discinesia, con fluctuaciones', 'parkinson'],
  ['G20.C', 'Parkinsonismo, no especificado', 'parkinson'],
  ['G21.11', 'Parkinsonismo secundario inducido por neurolépticos', 'parkinsonismo farmacológico'],
  ['G21.19', 'Otro parkinsonismo secundario inducido por medicamentos', 'parkinsonismo farmacológico'],
  ['G23.1', 'Parálisis supranuclear progresiva', 'PSP'],
  ['G10', 'Enfermedad de Huntington', 'corea'],
  ['G12.21', 'Esclerosis lateral amiotrófica', 'ELA'],
  ['G91.2', 'Hidrocefalia normotensiva (idiopática)', 'HPN hidrocefalia'],
  ['G25.0', 'Temblor esencial'],
  ['A81.00', 'Enfermedad de Creutzfeldt-Jakob, no especificada', 'ECJ prion'],
  ['F04', 'Trastorno amnésico debido a enfermedad fisiológica conocida', 'amnesia korsakoff'],
  ['F10.26', 'Dependencia de alcohol con trastorno amnésico persistente inducido por alcohol', 'korsakoff'],
  ['F10.27', 'Dependencia de alcohol con demencia persistente inducida por alcohol', 'demencia alcohólica'],
  ['E51.2', 'Encefalopatía de Wernicke', 'wernicke'],
  // ── Trastornos neurocognitivos leves y delirium ──
  ['F06.70', 'Trastorno neurocognitivo leve debido a afección fisiológica conocida, sin alteración conductual', 'DCL'],
  ['F06.71', 'Trastorno neurocognitivo leve debido a afección fisiológica conocida, con alteración conductual', 'DCL'],
  ['F05', 'Delirium debido a afección fisiológica conocida', 'delirium síndrome confusional agudo'],
  ['R41.81', 'Deterioro cognitivo relacionado con la edad'],
  ['R41.0', 'Desorientación, no especificada'],
  ['R41.3', 'Otra amnesia', 'pérdida de memoria'],
  ['R41.82', 'Alteración del estado mental, no especificada'],
  ['G93.40', 'Encefalopatía, no especificada'],
  ['G93.41', 'Encefalopatía metabólica'],
  ['G93.49', 'Otra encefalopatía'],
  // ── Enfermedad cerebrovascular ──
  ['I63.9', 'Infarto cerebral, no especificado', 'ictus ACV'],
  ['I61.9', 'Hemorragia intracerebral, no especificada', 'ictus hemorrágico'],
  ['I62.9', 'Hemorragia intracraneal no traumática, no especificada'],
  ['I62.00', 'Hemorragia subdural no traumática, no especificada', 'hematoma subdural'],
  ['G45.9', 'Accidente isquémico transitorio, no especificado', 'AIT'],
  ['I67.2', 'Aterosclerosis cerebral'],
  ['I67.3', 'Leucoencefalopatía vascular progresiva', 'binswanger leucoaraiosis'],
  ['I69.30', 'Secuelas no especificadas de infarto cerebral', 'secuelas ictus'],
  ['I69.320', 'Afasia como secuela de infarto cerebral', 'secuelas ictus'],
  ['I69.398', 'Otras secuelas de infarto cerebral', 'secuelas ictus'],
  ['G40.909', 'Epilepsia, no especificada, no intratable, sin estado epiléptico', 'crisis convulsivas'],
  // ── Síntomas conductuales, psicológicos y del sueño ──
  ['R45.1', 'Inquietud y agitación', 'agitación'],
  ['R45.4', 'Irritabilidad e ira'],
  ['R45.6', 'Violencia física', 'agresividad'],
  ['R45.851', 'Ideación suicida'],
  ['R44.3', 'Alucinaciones, no especificadas'],
  ['R44.0', 'Alucinaciones auditivas'],
  ['R44.1', 'Alucinaciones visuales'],
  ['R46.89', 'Otros síntomas y signos relacionados con la apariencia y el comportamiento'],
  ['G47.00', 'Insomnio, no especificado'],
  ['F51.01', 'Insomnio primario'],
  ['G47.52', 'Trastorno de conducta del sueño REM', 'TCSR'],
  ['G47.33', 'Apnea obstructiva del sueño', 'SAOS'],
  ['R40.0', 'Somnolencia'],
  // ── Psiquiatría ──
  ['F06.0', 'Trastorno psicótico con alucinaciones debido a afección fisiológica conocida', 'alucinosis orgánica'],
  ['F06.2', 'Trastorno psicótico con ideas delirantes debido a afección fisiológica conocida', 'delirante orgánico'],
  ['F06.30', 'Trastorno del estado de ánimo debido a afección fisiológica conocida, no especificado'],
  ['F06.31', 'Trastorno del estado de ánimo debido a afección fisiológica conocida, con rasgos depresivos'],
  ['F06.32', 'Trastorno del estado de ánimo debido a afección fisiológica conocida, con episodio similar a depresión mayor'],
  ['F06.33', 'Trastorno del estado de ánimo debido a afección fisiológica conocida, con rasgos maníacos'],
  ['F06.34', 'Trastorno del estado de ánimo debido a afección fisiológica conocida, con rasgos mixtos'],
  ['F06.4', 'Trastorno de ansiedad debido a afección fisiológica conocida'],
  ['F06.8', 'Otros trastornos mentales especificados debidos a afección fisiológica conocida'],
  ['F07.0', 'Cambio de personalidad debido a afección fisiológica conocida', 'orgánico personalidad'],
  ['F09', 'Trastorno mental no especificado debido a afección fisiológica conocida'],
  ['F20.0', 'Esquizofrenia paranoide'],
  ['F20.9', 'Esquizofrenia, no especificada'],
  ['F22', 'Trastornos delirantes', 'trastorno delirante paranoia'],
  ['F25.0', 'Trastorno esquizoafectivo, tipo bipolar'],
  ['F25.1', 'Trastorno esquizoafectivo, tipo depresivo'],
  ['F25.9', 'Trastorno esquizoafectivo, no especificado'],
  ['F29', 'Psicosis no orgánica, no especificada', 'psicosis'],
  ['F30.9', 'Episodio maníaco, no especificado', 'manía'],
  ['F31.9', 'Trastorno bipolar, no especificado', 'bipolar'],
  ['F32.0', 'Trastorno depresivo mayor, episodio único, leve', 'depresión'],
  ['F32.1', 'Trastorno depresivo mayor, episodio único, moderado', 'depresión'],
  ['F32.2', 'Trastorno depresivo mayor, episodio único, grave sin síntomas psicóticos', 'depresión'],
  ['F32.3', 'Trastorno depresivo mayor, episodio único, grave con síntomas psicóticos', 'depresión'],
  ['F32.4', 'Trastorno depresivo mayor, episodio único, en remisión parcial', 'depresión'],
  ['F32.5', 'Trastorno depresivo mayor, episodio único, en remisión completa', 'depresión'],
  ['F32.9', 'Trastorno depresivo mayor, episodio único, no especificado', 'depresión'],
  ['F32.A', 'Depresión, no especificada', 'depresión'],
  ['F33.0', 'Trastorno depresivo mayor, recurrente, episodio leve', 'depresión'],
  ['F33.1', 'Trastorno depresivo mayor, recurrente, episodio moderado', 'depresión'],
  ['F33.2', 'Trastorno depresivo mayor, recurrente, episodio grave sin síntomas psicóticos', 'depresión'],
  ['F33.3', 'Trastorno depresivo mayor, recurrente, episodio grave con síntomas psicóticos', 'depresión'],
  ['F33.9', 'Trastorno depresivo mayor, recurrente, no especificado', 'depresión'],
  ['F34.1', 'Trastorno distímico', 'distimia'],
  ['F41.0', 'Trastorno de pánico'],
  ['F41.1', 'Trastorno de ansiedad generalizada'],
  ['F41.8', 'Otros trastornos de ansiedad especificados', 'mixto ansioso depresivo'],
  ['F41.9', 'Trastorno de ansiedad, no especificado'],
  ['F42.9', 'Trastorno obsesivo-compulsivo, no especificado', 'TOC'],
  ['F43.10', 'Trastorno de estrés postraumático, no especificado', 'TEPT'],
  ['F43.20', 'Trastorno de adaptación, no especificado'],
  ['F43.21', 'Trastorno de adaptación con estado de ánimo depresivo'],
  ['F43.22', 'Trastorno de adaptación con ansiedad'],
  ['F43.23', 'Trastorno de adaptación con ansiedad y estado de ánimo depresivo mixtos'],
  ['F60.9', 'Trastorno de la personalidad, no especificado'],
  ['F79', 'Discapacidad intelectual, no especificada', 'retraso mental'],
  ['F10.20', 'Dependencia de alcohol, sin complicaciones', 'alcoholismo'],
  ['F13.20', 'Dependencia de sedantes, hipnóticos o ansiolíticos, sin complicaciones', 'benzodiacepinas'],
  // ── Geriatría: síndromes y función ──
  ['R54', 'Fragilidad relacionada con la edad (debilidad física senil)', 'fragilidad senilidad'],
  ['M62.84', 'Sarcopenia'],
  ['M62.81', 'Debilidad muscular (generalizada)'],
  ['R26.81', 'Inestabilidad de la marcha'],
  ['R26.89', 'Otras anomalías de la marcha y de la movilidad'],
  ['R26.2', 'Dificultad para caminar, no clasificada bajo otro concepto'],
  ['R29.6', 'Tendencia repetida a las caídas', 'caídas'],
  ['Z91.81', 'Antecedentes personales de caídas', 'caídas'],
  ['W19.XXXA', 'Caída no especificada, encuentro inicial', 'caída'],
  ['R13.10', 'Disfagia, no especificada'],
  ['R13.12', 'Disfagia orofaríngea'],
  ['R63.4', 'Pérdida de peso anormal'],
  ['R63.6', 'Peso insuficiente'],
  ['R63.0', 'Anorexia'],
  ['R64', 'Caquexia'],
  ['E46', 'Malnutrición proteico-calórica, no especificada', 'desnutrición'],
  ['E86.0', 'Deshidratación'],
  ['R32', 'Incontinencia urinaria, no especificada'],
  ['R15.9', 'Incontinencia fecal completa'],
  ['R53.81', 'Otro malestar (debilidad)'],
  ['R53.1', 'Debilidad'],
  ['R55', 'Síncope y colapso'],
  ['I95.1', 'Hipotensión ortostática'],
  ['R52', 'Dolor, no especificado'],
  ['G89.29', 'Otro dolor crónico'],
  ['Z74.01', 'Encamamiento (limitación a la cama)'],
  ['Z74.09', 'Otro problema relacionado con movilidad reducida'],
  ['Z74.1', 'Necesidad de ayuda para el cuidado personal'],
  ['Z74.2', 'Necesidad de ayuda en el domicilio sin otro miembro del hogar que pueda prestarla'],
  ['Z74.3', 'Necesidad de supervisión continua'],
  ['Z99.3', 'Dependencia de silla de ruedas'],
  ['Z99.81', 'Dependencia de oxígeno suplementario'],
  ['Z60.2', 'Problemas relacionados con vivir solo'],
  ['Z63.6', 'Familiar dependiente que necesita cuidados en el domicilio'],
  ['Z66', 'Orden de no reanimar', 'NO RCP'],
  ['Z51.5', 'Encuentro para cuidados paliativos', 'paliativos'],
  ['Z79.01', 'Uso prolongado (actual) de anticoagulantes', 'sintrom anticoagulación'],
  ['Z79.899', 'Otro tratamiento farmacológico prolongado (actual)', 'polifarmacia'],
  // ── Comorbilidad frecuente ──
  ['I10', 'Hipertensión esencial (primaria)', 'HTA'],
  ['I11.9', 'Cardiopatía hipertensiva sin insuficiencia cardíaca'],
  ['I25.10', 'Enfermedad aterosclerótica del corazón nativo sin angina de pecho', 'cardiopatía isquémica'],
  ['I48.91', 'Fibrilación auricular, no especificada', 'FA'],
  ['I48.0', 'Fibrilación auricular paroxística', 'FA'],
  ['I48.21', 'Fibrilación auricular permanente', 'FA'],
  ['I50.9', 'Insuficiencia cardíaca, no especificada', 'ICC'],
  ['I73.9', 'Enfermedad vascular periférica, no especificada'],
  ['I87.2', 'Insuficiencia venosa (crónica) (periférica)'],
  ['E11.9', 'Diabetes mellitus tipo 2 sin complicaciones', 'DM2'],
  ['E11.65', 'Diabetes mellitus tipo 2 con hiperglucemia', 'DM2'],
  ['E78.00', 'Hipercolesterolemia pura, no especificada'],
  ['E78.5', 'Hiperlipidemia, no especificada', 'dislipemia'],
  ['E66.9', 'Obesidad, no especificada'],
  ['E03.9', 'Hipotiroidismo, no especificado'],
  ['E55.9', 'Deficiencia de vitamina D, no especificada'],
  ['E53.8', 'Deficiencia de otras vitaminas del grupo B especificadas', 'déficit B12'],
  ['D51.9', 'Anemia por deficiencia de vitamina B12, no especificada'],
  ['D50.9', 'Anemia por deficiencia de hierro, no especificada', 'ferropenia'],
  ['D64.9', 'Anemia, no especificada'],
  ['E87.1', 'Hiposmolalidad e hiponatremia', 'hiponatremia'],
  ['E87.6', 'Hipopotasemia'],
  ['E87.5', 'Hiperpotasemia'],
  ['J18.9', 'Neumonía, microorganismo no especificado'],
  ['J69.0', 'Neumonitis por aspiración de alimento y vómito', 'broncoaspiración'],
  ['J44.1', 'Enfermedad pulmonar obstructiva crónica con exacerbación aguda', 'EPOC'],
  ['J44.9', 'Enfermedad pulmonar obstructiva crónica, no especificada', 'EPOC'],
  ['J20.9', 'Bronquitis aguda, no especificada'],
  ['J96.01', 'Insuficiencia respiratoria aguda con hipoxia'],
  ['J96.10', 'Insuficiencia respiratoria crónica, sin especificar si con hipoxia o hipercapnia'],
  ['U07.1', 'COVID-19', 'coronavirus'],
  ['A41.9', 'Sepsis, microorganismo no especificado'],
  ['A09', 'Gastroenteritis y colitis de origen infeccioso, no especificada'],
  ['A04.72', 'Enterocolitis por Clostridioides difficile, no recurrente', 'c difficile'],
  ['B02.9', 'Herpes zóster sin complicaciones'],
  ['L03.90', 'Celulitis, no especificada'],
  ['N39.0', 'Infección de vías urinarias, sitio no especificado', 'ITU'],
  ['N30.00', 'Cistitis aguda sin hematuria'],
  ['N40.0', 'Hiperplasia benigna de próstata sin síntomas del tracto urinario inferior', 'HBP'],
  ['N40.1', 'Hiperplasia benigna de próstata con síntomas del tracto urinario inferior', 'HBP'],
  ['N18.30', 'Enfermedad renal crónica, estadio 3 no especificado', 'ERC'],
  ['N18.9', 'Enfermedad renal crónica, no especificada', 'ERC'],
  ['N17.9', 'Fracaso renal agudo, no especificado'],
  ['R33.9', 'Retención de orina, no especificada'],
  ['K59.00', 'Estreñimiento, no especificado'],
  ['K56.41', 'Impactación fecal', 'fecaloma'],
  ['K21.9', 'Enfermedad por reflujo gastroesofágico sin esofagitis', 'ERGE'],
  ['K92.2', 'Hemorragia gastrointestinal, no especificada'],
  ['M81.0', 'Osteoporosis relacionada con la edad sin fractura patológica actual'],
  ['M80.08XA', 'Osteoporosis relacionada con la edad con fractura patológica actual de vértebra, encuentro inicial', 'aplastamiento vertebral'],
  ['S72.001A', 'Fractura de cuello de fémur derecho, no especificada, encuentro inicial por fractura cerrada', 'fractura cadera'],
  ['S72.002A', 'Fractura de cuello de fémur izquierdo, no especificada, encuentro inicial por fractura cerrada', 'fractura cadera'],
  ['S72.141A', 'Fractura intertrocantérea desplazada de fémur derecho, encuentro inicial por fractura cerrada', 'fractura cadera'],
  ['S72.142A', 'Fractura intertrocantérea desplazada de fémur izquierdo, encuentro inicial por fractura cerrada', 'fractura cadera'],
  ['M16.9', 'Artrosis de cadera, no especificada'],
  ['M17.9', 'Artrosis de rodilla, no especificada'],
  ['M19.90', 'Artrosis, no especificada, sitio no especificado'],
  ['M54.50', 'Dolor lumbar, no especificado', 'lumbalgia'],
  ['H91.90', 'Pérdida de audición, no especificada, oído no especificado', 'hipoacusia'],
  ['H54.7', 'Pérdida de visión no especificada'],
  ['H25.9', 'Catarata senil, no especificada'],
  ['C61', 'Neoplasia maligna de próstata'],
  ['C18.9', 'Neoplasia maligna de colon, no especificada'],
  ['C34.90', 'Neoplasia maligna de bronquio o pulmón, sin especificar lado'],
  ['C79.31', 'Neoplasia maligna secundaria de encéfalo', 'metástasis cerebral'],
  ['D32.0', 'Neoplasia benigna de las meninges cerebrales', 'meningioma'],
]

// Demencias con la clasificación por gravedad y alteración (CIE-10-ES): F01 vascular,
// F02 en otras enfermedades (se codifica además la enfermedad de base, p. ej. G30.x),
// F03 no especificada.
const GRAVEDADES: [string, string][] = [['', 'gravedad no especificada'], ['A', 'leve'], ['B', 'moderada'], ['C', 'grave']]
const ALTERACIONES: [string, string, string][] = [
  ['0', 'sin alteración conductual, psicótica, del estado de ánimo ni ansiedad', ''],
  ['11', 'con agitación', 'agitación'],
  ['18', 'con otra alteración conductual', 'conducta'],
  ['2', 'con alteración psicótica', 'psicosis delirios alucinaciones'],
  ['3', 'con alteración del estado de ánimo', 'depresión'],
  ['4', 'con ansiedad', 'ansiedad'],
]
const DEMENCIAS: { base: string; sinGravedad: string; desc: string; alias: string }[] = [
  { base: 'F01.', sinGravedad: '5', desc: 'Demencia vascular', alias: 'demencia vascular' },
  { base: 'F02.', sinGravedad: '8', desc: 'Demencia en otras enfermedades clasificadas bajo otro concepto', alias: 'demencia alzheimer parkinson lewy' },
  { base: 'F03.', sinGravedad: '9', desc: 'Demencia, no especificada', alias: 'demencia' },
]

function demencias(): Fila[] {
  const filas: Fila[] = []
  for (const d of DEMENCIAS) {
    for (const [letra, grav] of GRAVEDADES) {
      for (const [suf, alt, aliasAlt] of ALTERACIONES) {
        // sin gravedad: F0x.<5|8|9><sufijo>; con gravedad: F0x.<A|B|C><sufijo>
        const codigo = d.base + (letra || d.sinGravedad) + suf
        filas.push([codigo, `${d.desc}, ${grav}, ${alt}`, `${d.alias} ${aliasAlt}`.trim()])
      }
    }
  }
  return filas
}

// Úlceras por presión: L89.<zona><estadio>. Estadio: 0 no estadificable, 1-4, 6 lesión de
// tejidos profundos, 9 estadio no especificado.
const ZONAS_UPP: [string, string, string][] = [
  ['L89.15', 'región sacra', 'sacro'],
  ['L89.21', 'cadera derecha', 'trocánter'], ['L89.22', 'cadera izquierda', 'trocánter'],
  ['L89.31', 'nalga derecha', 'glúteo'], ['L89.32', 'nalga izquierda', 'glúteo'],
  ['L89.61', 'talón derecho', ''], ['L89.62', 'talón izquierdo', ''],
  ['L89.51', 'tobillo derecho', 'maléolo'], ['L89.52', 'tobillo izquierdo', 'maléolo'],
  ['L89.01', 'codo derecho', ''], ['L89.02', 'codo izquierdo', ''],
  ['L89.13', 'parte baja de la espalda derecha', 'lumbar'], ['L89.14', 'parte baja de la espalda izquierda', 'lumbar'],
  ['L89.81', 'cabeza', ''], ['L89.89', 'otra localización', ''],
]
const ESTADIOS_UPP: [string, string][] = [
  ['1', 'estadio 1'], ['2', 'estadio 2'], ['3', 'estadio 3'], ['4', 'estadio 4'],
  ['0', 'no estadificable'], ['6', 'lesión de tejidos profundos'], ['9', 'estadio no especificado'],
]
function upp(): Fila[] {
  const filas: Fila[] = []
  for (const [pref, zona, aliasZona] of ZONAS_UPP) {
    for (const [e, est] of ESTADIOS_UPP) filas.push([pref + e, `Úlcera por presión de ${zona}, ${est}`, `UPP escara ${aliasZona}`.trim()])
  }
  return filas
}

export const CIE10: CodigoCIE[] = [...BASE, ...demencias(), ...upp()].map(([code, desc, alias]) => ({ code, desc, alias }))

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

// Normalizado una sola vez (la lista es fija).
const NORMALIZADO = CIE10.map((c) => ({
  ...c,
  codeN: quitarTildes(c.code.toLowerCase()),
  // (la cláusula "sin alteración conductual, psicótica…" no se indexa: si no, "psicótica" también encontraría las demencias SIN alteración)
  palabras: quitarTildes(`${c.desc.replace(/, sin alteración conductual.*$/, '')} ${c.alias ?? ''}`.toLowerCase()).split(/[\s,()/-]+/).filter(Boolean),
  alias: quitarTildes((c.alias ?? '').toLowerCase()).split(/\s+/).filter(Boolean),
}))

export function buscarCIE10(q: string, max = 10): CodigoCIE[] {
  const t = quitarTildes(q.trim().toLowerCase())
  if (!t) return []
  const palabras = t.split(/\s+/).filter(Boolean)
  const res = NORMALIZADO
    .map((c) => {
      let puntos = 0
      if (c.codeN === t) puntos = 100
      else if (c.codeN.startsWith(t)) puntos = 80
      else if (c.codeN.includes(t)) puntos = 50
      // cada palabra buscada tiene que empezar alguna palabra del nombre o de los alias
      else if (palabras.every((p) => c.palabras.some((w) => w.startsWith(p)))) {
        puntos = palabras.every((p) => c.alias.includes(p)) ? 30 : 20
      }
      return { c, puntos }
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, max)
    .map((x) => ({ code: x.c.code, desc: x.c.desc }))
  return res
}

export function descripcionCIE10(code: string): string | null {
  const t = code.trim().toLowerCase()
  return CIE10.find((c) => c.code.toLowerCase() === t)?.desc ?? null
}

// Aviso para un código escrito a mano: null si está en el repertorio o no hay nada que decir.
export function avisoCodigoCIE10(code: string): string | null {
  const t = code.trim()
  if (!t || descripcionCIE10(t)) return null
  const sust = SUSTITUTOS.find(([re]) => re.test(t))
  if (sust) return `No es un código válido en la CIE-10-ES. ${sust[1]}`
  return 'Código fuera del repertorio: compruébalo con la CIE-10-ES vigente.'
}
