-- ============================================================================
-- Módulo de Agenda — Sistema TSA Dashboard
-- ============================================================================
-- Cómo correrlo: pega TODO este archivo en el SQL Editor de Supabase y
-- ejecútalo una sola vez. Requiere haber corrido antes scripts/rls_setup.sql
-- y scripts/auditoria_setup.sql (usa la función is_admin() y la función de
-- auditoría fn_registrar_auditoria() creadas ahí). Es seguro volver a
-- correrlo si algo falla a medias (usa IF NOT EXISTS / DROP POLICY IF EXISTS
-- / DROP TRIGGER IF EXISTS antes de crear).
--
-- Qué hace: crea dos tablas para el módulo "Agenda" > "Mi Agenda":
--
--   1) agenda_eventos — el calendario: reuniones, conferencias, llamadas.
--      Cada fila pertenece a un usuario (columna userid, quien la ve en su
--      calendario) y guarda quién la creó (columna creado_por). Un empleado
--      solo puede crearse eventos a sí mismo; Admin puede crearle un evento a
--      cualquier persona del personal (agendarle una reunión), y esa persona
--      lo ve aparecer en su propio calendario al entrar.
--
--   2) agenda_tareas — el tablero Kanban: tareas personales de cada usuario,
--      con estado pendiente / en_proceso / finalizado / cancelado.
--
-- No se crea una tabla nueva por usuario (eso sería un desastre de mantener);
-- ambas tablas son compartidas y usan la columna userid para separar los
-- datos de cada quien — igual que el resto del sistema (viajes, gastos, etc).
-- La seguridad de "cada quien ve lo suyo" la impone Postgres mismo vía RLS,
-- no el código de la app, así que no hay forma de que un empleado vea la
-- agenda de otro desde la consola del navegador.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabla: agenda_eventos (calendario)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_eventos (
    id bigserial PRIMARY KEY,
    userid bigint NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    creado_por bigint NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    descripcion text,
    tipo text NOT NULL DEFAULT 'reunion' CHECK (tipo IN ('reunion', 'conferencia', 'llamada', 'otro')),
    fecha_inicio timestamptz NOT NULL,
    fecha_fin timestamptz NOT NULL,
    ubicacion text,
    estado text NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'completado', 'cancelado')),
    color text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT agenda_eventos_fechas_check CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_userid ON public.agenda_eventos (userid);
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_fecha_inicio ON public.agenda_eventos (fecha_inicio);

-- ----------------------------------------------------------------------------
-- 2) Tabla: agenda_tareas (tablero Kanban)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_tareas (
    id bigserial PRIMARY KEY,
    userid bigint NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    titulo text NOT NULL,
    descripcion text,
    estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'finalizado', 'cancelado')),
    prioridad text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
    fecha_limite date,
    orden integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_tareas_userid ON public.agenda_tareas (userid);
CREATE INDEX IF NOT EXISTS idx_agenda_tareas_estado ON public.agenda_tareas (estado);

-- ----------------------------------------------------------------------------
-- 3) Vista fetch_agenda_eventos — igual patrón que fetch_viajes/fetch_origen_destino:
--    las lecturas usan esta vista (ya trae el nombre de a quién es el evento y
--    de quién lo agendó, sin que el código tenga que hacer el join); las
--    escrituras (create/update/delete) van directo contra agenda_eventos.
--    security_invoker = on para que la vista respete el RLS de agenda_eventos
--    y "user" según quién esté consultando, no según el dueño de la vista.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.fetch_agenda_eventos AS
SELECT
    e.*,
    trim(concat_ws(' ', u.nombre, u.apellido)) AS usuario_nombre,
    trim(concat_ws(' ', c.nombre, c.apellido)) AS creado_por_nombre
FROM public.agenda_eventos e
JOIN public."user" u ON u.id = e.userid
JOIN public."user" c ON c.id = e.creado_por;

ALTER VIEW public.fetch_agenda_eventos SET (security_invoker = on);

-- ----------------------------------------------------------------------------
-- 4) updated_at automático en cada UPDATE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_actualizar_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_eventos_updated_at ON public.agenda_eventos;
CREATE TRIGGER trg_agenda_eventos_updated_at BEFORE UPDATE ON public.agenda_eventos
    FOR EACH ROW EXECUTE FUNCTION public.fn_agenda_actualizar_updated_at();

DROP TRIGGER IF EXISTS trg_agenda_tareas_updated_at ON public.agenda_tareas;
CREATE TRIGGER trg_agenda_tareas_updated_at BEFORE UPDATE ON public.agenda_tareas
    FOR EACH ROW EXECUTE FUNCTION public.fn_agenda_actualizar_updated_at();

-- ----------------------------------------------------------------------------
-- 5) RLS — agenda_eventos
--    - Puede LEER: Admin (todo), o el dueño del evento (userid), o quien lo
--      creó (creado_por) — así un jefe que agendó una reunión a alguien
--      también la puede ver en su propia bandeja aunque no sea "su" evento.
--    - Puede CREAR: cualquier autenticado, pero SOLO como sí mismo
--      (creado_por debe ser su propio id); si además quiere que userid sea
--      OTRA persona (agendarle una reunión a alguien más), debe ser Admin.
--    - Puede ACTUALIZAR/BORRAR: Admin, el dueño, o quien lo creó.
-- ----------------------------------------------------------------------------
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_eventos_select" ON public.agenda_eventos;
CREATE POLICY "agenda_eventos_select" ON public.agenda_eventos FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
    OR creado_por = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
);

DROP POLICY IF EXISTS "agenda_eventos_insert" ON public.agenda_eventos;
CREATE POLICY "agenda_eventos_insert" ON public.agenda_eventos FOR INSERT TO authenticated
WITH CHECK (
    creado_por = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
    AND (
        public.is_admin()
        OR userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "agenda_eventos_update" ON public.agenda_eventos;
CREATE POLICY "agenda_eventos_update" ON public.agenda_eventos FOR UPDATE TO authenticated
USING (
    public.is_admin()
    OR userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
    OR creado_por = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
)
WITH CHECK (
    public.is_admin()
    OR userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
    OR creado_por = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
);

DROP POLICY IF EXISTS "agenda_eventos_delete" ON public.agenda_eventos;
CREATE POLICY "agenda_eventos_delete" ON public.agenda_eventos FOR DELETE TO authenticated
USING (
    public.is_admin()
    OR userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
    OR creado_por = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 6) RLS — agenda_tareas (100% personal: cada quien solo ve/edita lo suyo;
--    Admin puede ver todo para dar soporte, pero no es el flujo normal).
-- ----------------------------------------------------------------------------
ALTER TABLE public.agenda_tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_tareas_select" ON public.agenda_tareas;
CREATE POLICY "agenda_tareas_select" ON public.agenda_tareas FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid())
);

DROP POLICY IF EXISTS "agenda_tareas_all_propio" ON public.agenda_tareas;
CREATE POLICY "agenda_tareas_all_propio" ON public.agenda_tareas FOR ALL TO authenticated
USING (userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid()))
WITH CHECK (userid = (SELECT id FROM public."user" WHERE auth_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 7) Auditoría — se suman ambas tablas a la bitácora general (igual patrón
--    que scripts/auditoria_setup.sql).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auditoria ON public.agenda_eventos;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.agenda_eventos FOR EACH ROW EXECUTE FUNCTION public.fn_registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.agenda_tareas;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.agenda_tareas FOR EACH ROW EXECUTE FUNCTION public.fn_registrar_auditoria();

-- ============================================================================
-- Nada más que correr: el módulo "Agenda" > "Mi Agenda" queda visible para
-- todos los usuarios logueados (como Home), sin necesidad de asignarlo desde
-- Control de Accesos.
-- ============================================================================
