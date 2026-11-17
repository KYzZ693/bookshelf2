/** Shown when VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing. */
export default function SetupRequired() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-8 shadow-card">
        <p className="font-serif text-3xl text-ink">
          Book<span className="text-accent">Shelf</span>
        </p>
        <h1 className="mt-4 text-lg font-semibold text-ink">Connect your Supabase project</h1>
        <p className="mt-2 text-sm text-muted">
          The app needs your Supabase project URL and publishable key. Add them to a <code>.env</code> file in the project
          root (see <code>.env.example</code>) and restart the dev server.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-ink">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
        </pre>
        <p className="mt-4 text-xs text-faint">
          Find both under Supabase Dashboard → Project Settings → API. Never use the service_role key in the browser.
        </p>
      </div>
    </div>
  )
}
