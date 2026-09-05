/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for REST calls, e.g. https://hawkeye-backend.onrender.com (empty = same origin) */
  readonly VITE_API_BASE_URL?: string;
  /** WebSocket base for /ws, e.g. wss://hawkeye-backend.onrender.com (empty = same origin) */
  readonly VITE_WS_URL?: string;
  /** Supabase project URL for Realtime (production split deployment).
      When set together with VITE_SUPABASE_ANON_KEY, the dashboard uses
      Supabase Realtime instead of the raw backend WebSocket. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key. Public by design: RLS denies
      everything except source-scoped Realtime reads. NEVER put the
      service-role key or any secret in a VITE_* variable. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
