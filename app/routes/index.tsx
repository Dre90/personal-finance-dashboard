import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Logo } from "../components/AppShell";
import { createDashboard, getDashboard } from "../server/api";
import { setStoredDashboardId, getStoredDashboardId } from "../lib/auth";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<"home" | "login" | "create" | "created">("home");
  const [name, setName] = React.useState("");
  const [loginId, setLoginId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const existing = getStoredDashboardId();
    if (existing) {
      // Already logged in — soft suggest
      setLoginId(existing);
    }
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await createDashboard({ data: { name: name.trim() || undefined } });
      setCreatedId(res.id);
      setMode("created");
    } catch (err) {
      setError((err as Error).message ?? "Noe gikk galt");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const id = loginId.trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      setError("ID må være en gyldig UUID (36 tegn med bindestreker).");
      setLoading(false);
      return;
    }
    try {
      const dash = await getDashboard({ data: { dashboardId: id } });
      if (!dash) {
        setError("Fant ikke noe dashboard med den ID-en.");
      } else {
        setStoredDashboardId(id);
        await navigate({ to: "/dashboard" });
      }
    } catch (err) {
      setError((err as Error).message ?? "Klarte ikke logge inn");
    } finally {
      setLoading(false);
    }
  }

  function goToDashboard() {
    if (createdId) {
      setStoredDashboardId(createdId);
      void navigate({ to: "/dashboard" });
    }
  }

  async function copyCreatedId() {
    if (!createdId) return;
    await navigator.clipboard.writeText(createdId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center gap-2">
        <Logo className="w-9 h-9" />
        <span className="font-semibold text-lg">Økonomi</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-5">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <div className="badge">Privat · Anonymt · Norsk</div>
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight tracking-tight">
              Ta kontroll over{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                økonomien
              </span>{" "}
              din.
            </h1>
            <p className="text-muted text-lg leading-relaxed">
              Ett dashboard for budsjett, sparing, formue og lån. Ingen bruker, ingen e-post — bare
              en privat ID som er din nøkkel.
            </p>
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <Check /> Månedlig budsjett med kategorier og grafer
              </li>
              <li className="flex gap-2">
                <Check /> Sinking funds med progress og bidrag
              </li>
              <li className="flex gap-2">
                <Check /> Oversikt over ASK, pensjon og andre verdier
              </li>
              <li className="flex gap-2">
                <Check /> Lån med utvikling over tid
              </li>
              <li className="flex gap-2">
                <Check /> Årsoversikt og recap
              </li>
            </ul>
          </div>

          <div className="card">
            {mode === "home" && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Kom i gang</h2>
                <p className="text-sm text-muted">
                  Opprett et nytt dashboard, eller logg inn med din eksisterende ID.
                </p>
                <div className="grid gap-3 pt-1">
                  <button onClick={() => setMode("create")} className="btn btn-primary w-full">
                    Opprett nytt dashboard
                  </button>
                  <button onClick={() => setMode("login")} className="btn btn-ghost w-full">
                    Logg inn med ID
                  </button>
                </div>
              </div>
            )}

            {mode === "create" && (
              <form onSubmit={handleCreate} className="space-y-4">
                <h2 className="text-xl font-semibold">Nytt dashboard</h2>
                <div>
                  <label className="label">Navn på dashboardet (valgfritt)</label>
                  <input
                    autoFocus
                    className="input"
                    placeholder="F.eks. Familien Olsen"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="grid gap-2">
                  <button disabled={loading} className="btn btn-primary w-full">
                    {loading ? "Oppretter…" : "Opprett"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("home")}
                    className="btn btn-ghost w-full"
                  >
                    Tilbake
                  </button>
                </div>
              </form>
            )}

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <h2 className="text-xl font-semibold">Logg inn</h2>
                <div>
                  <label className="label">Dashboard-ID</label>
                  <input
                    autoFocus
                    className="input font-mono text-sm"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="grid gap-2">
                  <button disabled={loading} className="btn btn-primary w-full">
                    {loading ? "Sjekker…" : "Logg inn"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("home")}
                    className="btn btn-ghost w-full"
                  >
                    Tilbake
                  </button>
                </div>
              </form>
            )}

            {mode === "created" && createdId && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Dashboard opprettet 🎉</h2>
                <p className="text-sm text-muted">
                  Dette er din unike ID. <strong className="text-text">Ta vare på den</strong> — den
                  er din eneste måte å logge inn på. Det er ingen recovery.
                </p>
                <div className="card-soft">
                  <div className="font-mono text-sm break-all">{createdId}</div>
                  <button onClick={copyCreatedId} className="btn btn-ghost mt-3 w-full text-xs">
                    {copied ? "✓ Kopiert" : "Kopier ID"}
                  </button>
                </div>
                <button onClick={goToDashboard} className="btn btn-primary w-full">
                  Gå til dashboardet
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted">
        Bygget med TanStack Start, Tailwind og Netlify. Data lagres privat per dashboard-ID.
      </footer>
    </div>
  );
}

function Check() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className="text-emerald-400 mt-0.5 shrink-0"
    >
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
