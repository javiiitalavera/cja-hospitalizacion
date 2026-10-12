-- CJA Hospital — Demora al alta en el CMBD (2026-10-17)
--
-- Un paciente puede estar clínicamente listo para salir y seguir ingresado porque espera una plaza en residencia,
-- apoyos en casa, una decisión de la familia, etc. Se anota a mano, al alta, en la pestaña CMBD (como la infección
-- nosocomial):
--
--   · cmbd.demora_alta (sí / no / sin valorar), cmbd.demora_alta_motivo y cmbd.demora_alta_dias (días de demora).
--     El motivo y los días solo pueden tener valor si la casilla es «sí».
--   · El Dashboard saca de ahí los pacientes con demora, la demora media y la mediana. No cambia ninguna función.
--
-- Transaccional e idempotente.

begin;

alter table public.cmbd
    add column if not exists demora_alta boolean,
    add column if not exists demora_alta_motivo text,
    add column if not exists demora_alta_dias integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmbd_demora_motivo_valido') then
    alter table public.cmbd add constraint cmbd_demora_motivo_valido check (
      demora_alta_motivo is null or demora_alta_motivo in (
        'plaza_residencia',     -- espera de plaza en residencia o centro sociosanitario
        'apoyos_domicilio',     -- espera de apoyos o adaptación en el domicilio
        'familia',              -- decisión o gestión de la familia
        'tramite_legal',        -- trámite legal o judicial (incapacitación, tutela…)
        'transporte',           -- transporte o traslado
        'otro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cmbd_demora_dias_validos') then
    alter table public.cmbd add constraint cmbd_demora_dias_validos check (
      demora_alta_dias is null or demora_alta_dias between 1 and 999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cmbd_demora_detalle_coherente') then
    alter table public.cmbd add constraint cmbd_demora_detalle_coherente check (
      coalesce(demora_alta, false) or (demora_alta_motivo is null and demora_alta_dias is null));
  end if;
end $$;

commit;
