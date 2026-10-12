// Demora al alta: días que el paciente siguió ingresado estando ya clínicamente listo para salir, porque esperaba algo
// (plaza en residencia, apoyos en casa, decisión de la familia…). Se anota a mano al alta, en la pestaña CMBD
// (cmbd.demora_alta, demora_alta_motivo y demora_alta_dias).

export type MotivoDemora = 'plaza_residencia' | 'apoyos_domicilio' | 'familia' | 'tramite_legal' | 'transporte' | 'otro'

export const MOTIVOS_DEMORA: Record<MotivoDemora, string> = {
  plaza_residencia: 'Espera de plaza en residencia o centro sociosanitario',
  apoyos_domicilio: 'Espera de apoyos o adaptación en el domicilio',
  familia: 'Decisión o gestión de la familia',
  tramite_legal: 'Trámite legal o judicial (incapacitación, tutela…)',
  transporte: 'Transporte o traslado',
  otro: 'Otro motivo',
}

export function motivoDemora(m: string | null | undefined): string {
  return (m && MOTIVOS_DEMORA[m as MotivoDemora]) || (m ?? '—')
}
