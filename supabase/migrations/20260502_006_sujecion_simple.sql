-- Migración: cambiar sujeción silla ruedas y sillón a valor simple
-- (No / Sí precisa / Continuo) en lugar de array de múltiple selección

alter table items_paciente
  alter column sujecion_silla_ruedas type text using (
    case
      when sujecion_silla_ruedas = '{}' or sujecion_silla_ruedas is null then null
      else (sujecion_silla_ruedas::text)
    end
  ),
  alter column sujecion_silla_ruedas drop default;

alter table items_paciente
  alter column sujecion_sillon type text using (
    case
      when sujecion_sillon = '{}' or sujecion_sillon is null then null
      else (sujecion_sillon::text)
    end
  ),
  alter column sujecion_sillon drop default;

-- Añadir constraint de valores válidos
alter table items_paciente
  add constraint sujecion_silla_ruedas_check
  check (sujecion_silla_ruedas in ('no', 'si_precisa', 'continuo') or sujecion_silla_ruedas is null);

alter table items_paciente
  add constraint sujecion_sillon_check
  check (sujecion_sillon in ('no', 'si_precisa', 'continuo') or sujecion_sillon is null);
