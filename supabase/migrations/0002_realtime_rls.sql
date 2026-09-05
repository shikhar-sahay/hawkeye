-- HawkEye Supabase migration 0002: Realtime publication + Row Level Security.
--
-- HAND-WRITTEN. Depends on 0001_schema.sql.
--
-- Design (see docs/architecture-supabase.md):
--   * Browsers NEVER touch tables directly for reads/writes except through
--     Supabase Realtime subscriptions. All REST traffic goes through Vercel
--     serverless functions using the service-role key (bypasses RLS).
--   * Realtime clients authenticate with a short-lived custom JWT minted by
--     POST /api/realtime-token. The JWT is signed with the project's JWT
--     secret, carries role "authenticated" and a source_id claim. The
--     frontend never chooses its own source_id.
--   * RLS policies therefore only need FOR SELECT on the three streamed
--     tables, scoped to the JWT's source_id. Every other table is RLS
--     enabled with NO policies (default deny), including for reads.
--   * anon gets no grants at all.
--
-- NOTE: the `anon` / `authenticated` roles and the `auth.jwt()` function
-- exist natively on Supabase. When applying this file to a bare PostgreSQL
-- instance (local verification), create the roles first:
--   CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;

-- ---------------------------------------------------------------------------
-- 1. Strip all default access, then grant the minimum Realtime needs.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.normalized_events TO authenticated;
GRANT SELECT ON public.alerts TO authenticated;
GRANT SELECT ON public.incidents TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS everywhere. Tables without policies default to deny-all,
--    which is exactly what we want for sources/keys/raw/join tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.application_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_alerts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Source-scoped SELECT policies on the three streamed tables.
--    auth.jwt() ->> 'source_id' comes from the custom realtime JWT minted
--    server-side after API-key validation. Comparison is done in TEXT space
--    on purpose: casting the claim to int would turn a malformed claim into
--    a statement error (500), while text equality fails closed to zero rows.
--    A missing claim yields NULL, and NULL = source_id is never true.
-- ---------------------------------------------------------------------------
CREATE POLICY "source_isolation_select" ON public.normalized_events
    FOR SELECT TO authenticated
    USING (source_id::text = (auth.jwt() ->> 'source_id'));

CREATE POLICY "source_isolation_select" ON public.alerts
    FOR SELECT TO authenticated
    USING (source_id::text = (auth.jwt() ->> 'source_id'));

CREATE POLICY "source_isolation_select" ON public.incidents
    FOR SELECT TO authenticated
    USING (source_id::text = (auth.jwt() ->> 'source_id'));

-- ---------------------------------------------------------------------------
-- 4. Realtime publication. Supabase owns a publication literally named
--    supabase_realtime; create it only when missing so this file also
--    applies to bare PostgreSQL (local verification).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE
    public.normalized_events,
    public.alerts,
    public.incidents;

-- ---------------------------------------------------------------------------
-- 5. Replica identity. Dashboard live-updates include status changes
--    (alerts/incidents UPDATE), which CDC only ships with FULL identity.
--    Events are insert-only; default identity is enough there.
-- ---------------------------------------------------------------------------
ALTER TABLE public.alerts REPLICA IDENTITY FULL;
ALTER TABLE public.incidents REPLICA IDENTITY FULL;
