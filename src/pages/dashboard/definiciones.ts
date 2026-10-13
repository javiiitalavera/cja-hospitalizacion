// Cómo se calcula cada indicador del Dashboard, en lenguaje llano. Es el único sitio donde se escriben estas
// definiciones: las usan el icono «i» de tarjetas y cabeceras de tabla (InfoIndicador) y la hoja «Definiciones»
// del Excel. Cada una tiene tres partes:
//   · queCuenta: qué mide, con la fecha que usa para decidir si entra en el periodo.
//   · formula:   la operación, con los numeradores y denominadores.
//   · ojo:       lo que NO incluye o cómo conviene leerlo (opcional).
// Si cambia un cálculo (SQL o código de la pestaña), hay que cambiar aquí su definición.

export interface Definicion {
  titulo: string
  queCuenta: string
  formula: string
  ojo?: string
}

function definiciones<K extends string>(d: Record<K, Definicion>): Record<K, Definicion> { return d }

export const DEFINICIONES = definiciones({
  // ── Situación de hoy (no depende del periodo) ───────────────
  estancia_60: {
    titulo: 'Estancia ≥ 60 días',
    queCuenta: 'Pacientes ingresados ahora cuyo ingreso empezó hace 60 días o más.',
    formula: 'Ingresos activos con fecha de ingreso ≤ hoy − 60 días.',
    ojo: 'Es una foto de hoy: no cambia con el periodo elegido.',
  },
  semaforo_riesgo: {
    titulo: 'Semáforo rojo/naranja',
    queCuenta: 'Pacientes ingresados ahora con el semáforo de riesgo de caídas en rojo o naranja.',
    formula: 'Ingresos activos con semáforo de caídas = rojo o naranja.',
    ojo: 'Foto de hoy. Quien no tiene semáforo valorado no se cuenta.',
  },
  contencion_activa: {
    titulo: 'Contención activa',
    queCuenta: 'Pacientes ingresados ahora con una pauta de contención activa.',
    formula: 'Ingresos activos con contención continua por seguridad (día) o contención fija (noche). En Seguridad se muestra también el % sobre todos los ingresados.',
    ojo: 'Solo contención: no cuentan barras, cota cero ni sensores. Mide la pauta registrada, no cuántas veces se ha aplicado. Foto de hoy.',
  },
  contencion_si_precisa: {
    titulo: 'Contención «si precisa»',
    queCuenta: 'Pacientes ingresados ahora con pauta de contención «si precisa» (de día o de noche) y sin contención activa.',
    formula: 'Ingresos activos con pauta «si precisa» y sin contención activa.',
    ojo: 'Cada paciente cuenta en una sola de las dos tarjetas: si tiene contención activa no se suma aquí. Foto de hoy.',
  },
  contencion_sin_confirmar: {
    titulo: 'Contención sin confirmar',
    queCuenta: 'Pautas de contención (activas o «si precisa») que todavía no ha confirmado un profesional.',
    formula: 'Ingresos activos con pauta activa o «si precisa» y sin confirmar.',
    ojo: 'Es trabajo pendiente, no un tipo de contención. Foto de hoy.',
  },
  incidencias_pendientes: {
    titulo: 'Incidencias pendientes',
    queCuenta: 'Incidencias abiertas a las que les falta completar datos.',
    formula: 'Incidencias en estado «pendiente», de cualquier fecha.',
    ojo: 'Cuenta también las de pacientes ya dados de alta. No incluye úlceras ni infecciones nosocomiales (se registran en Curas y en el CMBD).',
  },
  activos_mas_dias: {
    titulo: 'Episodios activos de larga duración',
    queCuenta: 'Pacientes ingresados ahora con 30, 60 o 90 días de estancia o más.',
    formula: 'Ingresos activos con fecha de ingreso ≤ hoy − 30 / 60 / 90 días.',
    ojo: 'Foto de hoy, no depende del periodo. Los tramos se solapan: quien lleva 90 días está también en los de 60 y 30.',
  },

  // ── Actividad del periodo ───────────────────────────────────
  altas: {
    titulo: 'Altas',
    queCuenta: 'Episodios cerrados como alta ordinaria, según su fecha de alta.',
    formula: 'Ingresos con estado «alta» y fecha de alta dentro del periodo.',
    ojo: 'No incluye traslados ni éxitus, que se cuentan aparte. Altas + traslados + éxitus son las «salidas».',
  },
  salidas: {
    titulo: 'Salidas del periodo',
    queCuenta: 'Episodios que terminan dentro del periodo, sea cual sea el motivo, según su fecha de alta.',
    formula: 'Altas + traslados + éxitus con fecha de alta dentro del periodo.',
    ojo: 'Es la base de esta pestaña. Cada indicador dice con cuántas salidas se calcula de verdad (las que tienen el dato).',
  },
  balance: {
    titulo: 'Balance',
    queCuenta: 'Diferencia entre las entradas y las salidas del periodo.',
    formula: 'Ingresos nuevos − salidas (altas + traslados + éxitus).',
    ojo: 'Positivo: entraron más de los que salieron. Negativo: al revés. No es ni bueno ni malo por sí mismo.',
  },
  dias_estancia: {
    titulo: 'Días-estancia',
    queCuenta: 'Suma de los días que los pacientes han estado ingresados dentro del periodo.',
    formula: 'Para cada ingreso que toca el periodo: días entre el más tardío de (ingreso, inicio) y el más temprano de (alta, fin + 1). Se suman todos.',
    ojo: 'Es el denominador de las tasas «por 1.000 días-estancia». El día del alta no cuenta como día de estancia.',
  },
  ocupacion_media: {
    titulo: 'Ocupación media',
    queCuenta: 'Porcentaje medio de camas ocupadas cada día del periodo.',
    formula: 'Media diaria de camas ocupadas ÷ camas de la unidad × 100.',
    ojo: 'Una cama cuenta como ocupada un día si el ingreso empezó ese día o antes y el alta es posterior a ese día.',
  },
  ocupacion_min_max: {
    titulo: 'Ocupación mínima y máxima',
    queCuenta: 'La ocupación del día menos ocupado y del más ocupado del periodo.',
    formula: 'Mínimo / máximo de camas ocupadas en un día ÷ camas de la unidad × 100.',
    ojo: 'Misma regla de cama ocupada que la ocupación media.',
  },
  estancia_media: {
    titulo: 'Estancia media',
    queCuenta: 'Duración media de los episodios que terminan en el periodo.',
    formula: 'Media de (fecha de alta − fecha de ingreso) de las salidas con alta en el periodo.',
    ojo: 'Incluye altas, traslados y éxitus. No incluye a quienes siguen ingresados. Sin salidas en el periodo se muestra «—».',
  },
  estancia_mediana: {
    titulo: 'Estancia mediana',
    queCuenta: 'Valor central de la duración de esos mismos episodios.',
    formula: 'Mediana de (fecha de alta − fecha de ingreso) de las salidas con alta en el periodo.',
    ojo: 'La mitad de las salidas estuvo menos días que este valor. Las estancias muy largas la afectan menos que a la media.',
  },
  reingresos: {
    titulo: 'Reingresos (≤180 y ≤30 días)',
    queCuenta: 'Ingresos nuevos del periodo de pacientes con un alta o traslado en los 180 días anteriores. Debajo, los que fueron en los 30 primeros.',
    formula: 'Ingresos del periodo con un alta o traslado previo del mismo paciente hasta 180 (o 30) días antes. Los de 30 días están incluidos en los de 180.',
    ojo: 'Es una proporción sobre los ingresos, no sobre las altas. Solo cuenta episodios registrados en la aplicación. Un éxitus no cuenta como alta previa.',
  },
  incidencias: {
    titulo: 'Incidencias',
    queCuenta: 'Incidencias registradas en el periodo, según la fecha en que ocurrieron.',
    formula: 'Nº de incidencias con fecha del suceso dentro del periodo. Tasa = incidencias ÷ días-estancia × 1.000.',
    ojo: 'Sin úlceras por presión ni infecciones nosocomiales, que tienen su apartado en Seguridad.',
  },

  // ── Demora al alta ──────────────────────────────────────────
  demora_pacientes: {
    titulo: 'Pacientes con demora al alta',
    queCuenta: 'Pacientes con la casilla «Demora al alta» marcada en el CMBD de su alta.',
    formula: 'Pacientes con demora ÷ salidas con la pregunta contestada (sí o no) × 100.',
    ojo: 'Altas y traslados con fecha de alta en el periodo, sin éxitus. Se cuenta por episodio: un paciente que reingresa en el periodo puede contar más de una vez. Las salidas con la pregunta sin contestar no cuentan ni como demora ni como no demora.',
  },
  demora_media: {
    titulo: 'Demora media',
    queCuenta: 'Días de demora medios entre los pacientes con demora.',
    formula: 'Suma de los días de demora ÷ nº de pacientes con demora que tienen los días escritos.',
    ojo: 'Un paciente con demora pero sin los días escritos no entra. Sin ninguno con días se muestra «—».',
  },
  demora_mediana: {
    titulo: 'Demora mediana',
    queCuenta: 'Valor central de los días de demora.',
    formula: 'Mediana de los días de demora de los pacientes con demora y días escritos.',
    ojo: 'La mitad de las demoras duró menos que este valor.',
  },

  // ── Diagnósticos ────────────────────────────────────────────
  dx_codificadas: {
    titulo: 'Con diagnóstico principal codificado',
    queCuenta: 'Salidas del periodo cuyo CMBD ya tiene diagnóstico principal.',
    formula: 'Salidas con diagnóstico principal ÷ salidas del periodo × 100.',
    ojo: 'El resto de cifras de esta pestaña se calculan solo con estas salidas.',
  },
  dx_demencia: {
    titulo: 'Salidas con demencia codificada',
    queCuenta: 'Salidas con algún código de demencia, como principal o como secundario.',
    formula: 'Salidas con código de demencia ÷ salidas con diagnóstico principal codificado × 100.',
    ojo: 'Se reconoce por prefijo: G30, F01, F02, F03, G31.83, G31.0x. Un código de la OMS que no existe en la CIE-10-ES (F00.x) no cuenta como Alzheimer hasta corregirlo. El deterioro cognitivo leve (G31.84) no cuenta.',
  },

  // ── Evolución clínica ───────────────────────────────────────
  escala_ambas: {
    titulo: 'Con ambas valoraciones',
    queCuenta: 'Salidas en las que la escala está puntuada al ingreso y también al alta.',
    formula: 'Nº de salidas del periodo con el total de la escala en los dos momentos.',
    ojo: 'Solo estas se comparan: las que tienen una única valoración no entran en ninguna otra cifra de la escala.',
  },
  escala_media: {
    titulo: 'Media ingreso → alta',
    queCuenta: 'Puntuación media de la escala al ingreso y al alta.',
    formula: 'Media de la puntuación al ingreso → media al alta, solo en salidas con ambas valoraciones.',
    ojo: 'Las dos medias usan las mismas salidas, para que se puedan comparar. Las escalas no se suman entre sí.',
  },
  escala_cambio: {
    titulo: 'Cambio medio ingreso → alta',
    queCuenta: 'Cuánto cambia la puntuación entre el ingreso y el alta.',
    formula: 'Media de (puntuación al alta − puntuación al ingreso) en salidas con ambas valoraciones. Entre paréntesis, la mediana.',
    ojo: 'NPI-Q: bajar es mejorar. Barthel y Lawton: subir es mejorar. La mediana se afecta menos por casos extremos.',
  },
  escala_mejoran: {
    titulo: 'Pacientes que mejoran · igual · empeoran',
    queCuenta: 'Cuántos pacientes terminan mejor, igual o peor que al ingreso en esa escala.',
    formula: 'Se compara la puntuación al alta con la del ingreso en cada salida con ambas valoraciones. Mejora: baja el NPI-Q, o suben Barthel o Lawton. Igual: misma puntuación.',
    ojo: 'Se cuenta por episodio: un paciente que reingresa puede contar más de una vez. Cualquier cambio cuenta, por pequeño que sea: no se aplica ningún umbral clínico.',
  },

  // ── Medicación ──────────────────────────────────────────────
  med_farmacos: {
    titulo: 'Fármacos por paciente',
    queCuenta: 'Número medio de fármacos por paciente en el informe de ingreso y en el de alta.',
    formula: 'Media de fármacos (un principio activo cuenta una vez) entre los pacientes con la medicación rellenada en ese informe, por separado al ingreso y al alta.',
    ojo: 'Una lista vacía que el médico ha dejado así («sin medicación») cuenta con 0 fármacos. Si la medicación está sin tocar, ese paciente queda fuera. Se cuenta por episodio: un paciente que reingresa puede contar más de una vez. La media de ingreso y la de alta pueden salir de pacientes distintos; para comparar los mismos está el cambio medio. Sin ninguna salida rellenada se muestra «—».',
  },
  med_psicofarmacos: {
    titulo: 'Psicofármacos por paciente',
    queCuenta: 'Número medio de psicofármacos por paciente en el informe de ingreso y en el de alta.',
    formula: 'Media de psicofármacos entre los pacientes con la medicación rellenada en ese informe, por separado al ingreso y al alta.',
    ojo: 'Psicofármaco: grupos N05 y N06 de la clasificación ATC, más lo que el médico marca a mano como «Sí» (la marca manual manda sobre el catálogo). Los pacientes «sin medicación» cuentan con 0. Se cuenta por episodio: un paciente que reingresa puede contar más de una vez.',
  },
  med_cambio: {
    titulo: 'Cambio medio ingreso → alta',
    queCuenta: 'Cuántos fármacos y psicofármacos más o menos tiene el paciente al alta que al ingreso.',
    formula: 'Media de (nº al alta − nº al ingreso) en los pacientes con la medicación rellenada en los dos informes.',
    ojo: 'Menos fármacos no demuestra por sí solo una mejor atención: hay que leerlo junto con la evolución clínica.',
  },
  med_polifarmacia: {
    titulo: 'Polifarmacia',
    queCuenta: 'Pacientes con 5 o más (o 10 o más) fármacos en el informe de ingreso o en el de alta.',
    formula: 'Informes con ≥ 5 (o ≥ 10) fármacos ÷ informes con la medicación rellenada en ese momento × 100.',
    ojo: 'Ingreso y alta se calculan por separado, cada uno sobre sus propios informes. Se cuenta por episodio: un paciente que reingresa puede contar más de una vez.',
  },
  med_dos_antipsicoticos: {
    titulo: '2 o más antipsicóticos',
    queCuenta: 'Pacientes con dos o más antipsicóticos distintos a la vez.',
    formula: 'Informes con ≥ 2 antipsicóticos ÷ informes con la medicación rellenada en ese momento × 100.',
  },
  med_cambio_grupo: {
    titulo: 'Cambio por grupo',
    queCuenta: 'Cómo cambia el número de antipsicóticos o de benzodiacepinas entre el ingreso y el alta.',
    formula: 'En los pacientes con la medicación rellenada en los dos informes: aumentan / igual / reducen según el nº de fármacos del grupo. «Empiezan»: de 0 a 1 o más. «Se retiran»: de 1 o más a 0.',
    ojo: 'Cambiar un antipsicótico por otro cuenta como «igual». «Empiezan» y «Se retiran» ya están dentro de «aumentan» y «reducen».',
  },
  med_grupos: {
    titulo: 'Pacientes con al menos un fármaco del grupo',
    queCuenta: 'Pacientes con uno o más fármacos de cada grupo en el informe de ingreso y en el de alta.',
    formula: 'Informes con ≥ 1 fármaco del grupo ÷ informes con la medicación rellenada en ese momento × 100.',
    ojo: 'Un paciente puede estar en varios grupos.',
  },

  // ── Seguridad ───────────────────────────────────────────────
  seg_incidencias: {
    titulo: 'Incidencias por tipo',
    queCuenta: 'Sucesos registrados de cada tipo, según la fecha en que ocurrieron.',
    formula: 'Nº de incidencias de ese tipo con fecha del suceso dentro del periodo. «Pacientes afectados» cuenta personas distintas.',
    ojo: 'Sin úlceras ni infecciones nosocomiales: se muestran más abajo.',
  },
  seg_pendientes: {
    titulo: 'Pendientes',
    queCuenta: 'Incidencias del periodo a las que falta completar datos.',
    formula: 'Nº de incidencias de ese tipo con estado «pendiente».',
  },
  seg_tasa: {
    titulo: 'Tasa por 1.000 días-estancia',
    queCuenta: 'Incidencias en relación con el tiempo que han estado ingresados los pacientes.',
    formula: 'Incidencias del tipo ÷ días-estancia del periodo × 1.000.',
    ojo: 'Permite comparar periodos de distinta duración u ocupación. Con pocos casos la tasa varía mucho.',
  },
  caidas_con_lesion: {
    titulo: 'Caídas con lesión',
    queCuenta: 'Caídas del periodo en las que se ha confirmado que hubo lesión.',
    formula: 'Caídas con consecuencia Contusión, Herida, Fractura, TCE u Otro. Debajo, la tasa: ÷ días-estancia × 1.000.',
    ojo: 'Las pendientes de valoración no cuentan aquí.',
  },
  caidas_graves: {
    titulo: 'Caídas graves',
    queCuenta: 'Caídas del periodo con fractura o TCE como consecuencia (y las antiguas marcadas con gravedad «grave»).',
    formula: 'Caídas con consecuencia = Fractura o TCE (o, en las antiguas, gravedad = Grave).',
    ojo: 'Una caída cuenta una vez aunque cumpla las dos condiciones.',
  },
  caidas_pendientes: {
    titulo: 'Caídas pendientes de valoración',
    queCuenta: 'Caídas del periodo en las que aún no se ha confirmado si hubo lesión.',
    formula: 'Caídas con consecuencia = Pendiente de valoración.',
    ojo: 'Es trabajo pendiente: al valorarlas pasan a «con lesión» o a «sin lesión».',
  },
  caidas_repetidas: {
    titulo: 'Pacientes con 2 o más caídas',
    queCuenta: 'Pacientes distintos que han tenido al menos dos caídas en el periodo.',
    formula: 'Pacientes con ≥ 2 caídas con fecha del suceso dentro del periodo.',
    ojo: 'Cuenta personas, no episodios: si un paciente tuvo dos ingresos, sus caídas se suman.',
  },
  upp_producidas: {
    titulo: 'Úlceras producidas en el centro',
    queCuenta: 'Úlceras por presión que han aparecido durante el ingreso.',
    formula: 'Lesiones de tipo UPP con fecha de inicio en el periodo y origen «dentro del centro». Tasa = nº ÷ días-estancia × 1.000.',
    ojo: 'El periodo se cuenta por la fecha de inicio o detección. Las que ya estaban al ingreso no entran en esta tasa.',
  },
  upp_grado: {
    titulo: 'Úlceras de grado III-IV',
    queCuenta: 'Úlceras del periodo cuyo grado más alto registrado es III o IV.',
    formula: 'Lesiones UPP con inicio en el periodo y alguna valoración de grado III o IV.',
    ojo: 'Se toma el grado más alto que haya llegado a registrarse, aunque la úlcera mejorara después.',
  },
  upp_sin_grado: {
    titulo: 'Úlceras sin grado valorado',
    queCuenta: 'Úlceras del periodo en las que ninguna valoración tiene el grado escrito.',
    formula: 'Lesiones UPP con inicio en el periodo, sin ninguna valoración con grado y no marcadas como «no clasificable».',
    ojo: 'Es trabajo pendiente en Curas. Las «no clasificables» ya están valoradas y se cuentan aparte.',
  },
  derivaciones: {
    titulo: 'Consecuencias de las incidencias',
    queCuenta: 'Incidencias del periodo que acabaron en una visita a urgencias sin ingreso o en un ingreso hospitalario.',
    formula: 'Incidencias con derivación = «Urgencias, sin ingreso» (una tarjeta) o «Ingreso hospitalario» (la otra).',
    ojo: 'Cuenta incidencias, no pacientes.',
  },
  infeccion_nosocomial: {
    titulo: 'Infecciones nosocomiales',
    queCuenta: 'Episodios con la casilla «Infección nosocomial» marcada en el CMBD.',
    formula: 'Episodios que coinciden con el periodo (ingresados algún día de él) con la casilla marcada.',
    ojo: 'Cuenta episodios, no infecciones nuevas fechadas en el periodo: un episodio con dos infecciones cuenta una vez.',
  },
})

export type ClaveDefinicion = keyof typeof DEFINICIONES

export function definicionDe(clave: ClaveDefinicion): Definicion { return DEFINICIONES[clave] }
