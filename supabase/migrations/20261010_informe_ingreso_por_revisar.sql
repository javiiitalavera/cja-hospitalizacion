-- Informe de ingreso: al reingresar a un paciente, la valoración geriátrica y el
-- tratamiento del ingreso anterior se copian como punto de partida, pero quedan
-- marcados "por revisar" hasta que el médico los edite o los confirme.
-- Se puede ejecutar más de una vez.

begin;

alter table public.informe_ingreso
    add column if not exists campos_por_revisar text[] not null default '{}';

commit;
