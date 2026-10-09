-- Curas: poder registrar que la cura de un día NO se hizo, con su motivo
-- (el paciente la rechaza, está fuera de la unidad, indicación médica…).
-- Requiere 20261008_curas.sql. Se puede ejecutar más de una vez.

begin;

alter table public.curas_registro
    add column if not exists estado text not null default 'hecha',
    add column if not exists motivo text;

alter table public.curas_registro drop constraint if exists curas_registro_estado_check;
alter table public.curas_registro
    add constraint curas_registro_estado_check check (estado in ('hecha', 'no_realizada'));

alter table public.curas_registro drop constraint if exists curas_registro_motivo_largo_check;
alter table public.curas_registro
    add constraint curas_registro_motivo_largo_check check (motivo is null or length(motivo) <= 500);

-- Una cura no realizada siempre lleva motivo.
alter table public.curas_registro drop constraint if exists curas_registro_motivo_check;
alter table public.curas_registro
    add constraint curas_registro_motivo_check
    check (estado = 'hecha' or length(btrim(coalesce(motivo, ''))) > 0);

commit;
