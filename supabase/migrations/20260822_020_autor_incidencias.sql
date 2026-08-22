-- ============================================================
-- "Registrado por" no se puede falsear (solo al crear)
--
-- La pantalla ya no deja elegir quién registra una incidencia: es
-- siempre quien ha iniciado sesión. Esta migración lo hace cumplir
-- también en la base de datos, para que nadie con acceso directo a
-- la API pueda crear una incidencia a nombre de otra persona.
--
-- Importante: esta comprobación de autoría se aplica SOLO al crear
-- (INSERT). Editar o borrar una incidencia ya registrada por un
-- compañero sigue funcionando igual que hasta ahora (trabajo en
-- equipo), sin exigir que el autor original coincida con quien edita.
--
-- Nota técnica: varias políticas "permissive" para el MISMO comando
-- se combinan con OR, no con AND. Por eso aquí se divide la política
-- en INSERT / UPDATE / DELETE por separado en vez de una sola "for
-- all": así la exigencia de autoría solo entra en juego al crear.
--
-- Re-ejecutable sin dar error.
-- ============================================================

begin;

drop policy if exists escribir_equipo on eventos;

create policy crear_evento on eventos for insert to authenticated
  with check (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
    and registrado_por_id = (select id from profesionales where user_id = auth.uid() limit 1)
  );

create policy editar_evento on eventos for update to authenticated
  using (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
  )
  with check (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
  );

create policy borrar_evento on eventos for delete to authenticated
  using (
    private.mi_rol() in ('medico','enfermeria','auxiliar','tecnico')
    and exists (select 1 from ingresos i where i.id = eventos.ingreso_id and i.estado = 'activo')
  );

commit;
