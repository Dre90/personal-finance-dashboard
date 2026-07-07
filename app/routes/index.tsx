import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Logo } from "../components/AppShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Field, FieldLabel } from "../components/ui/field";
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-2 px-6 py-4">
        <Logo className="size-9" />
        <span className="text-lg font-semibold">Økonomi</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div className="space-y-5">
            <Badge variant="secondary">Privat · Anonymt · Norsk</Badge>
            <h1 className="text-4xl leading-tight font-semibold tracking-tight md:text-5xl">
              Ta kontroll over{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                økonomien
              </span>{" "}
              din.
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Ett dashboard for budsjett, sparing, formue og lån. Ingen bruker, ingen e-post — bare
              en privat ID som er din nøkkel.
            </p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li className="flex gap-2">
                <Check className="text-success mt-0.5 size-4 shrink-0" /> Månedlig budsjett med
                kategorier og grafer
              </li>
              <li className="flex gap-2">
                <Check className="text-success mt-0.5 size-4 shrink-0" /> Sinking funds med progress
                og bidrag
              </li>
              <li className="flex gap-2">
                <Check className="text-success mt-0.5 size-4 shrink-0" /> Oversikt over ASK, pensjon
                og andre verdier
              </li>
              <li className="flex gap-2">
                <Check className="text-success mt-0.5 size-4 shrink-0" /> Lån med utvikling over tid
              </li>
              <li className="flex gap-2">
                <Check className="text-success mt-0.5 size-4 shrink-0" /> Årsoversikt og recap
              </li>
            </ul>
          </div>

          <Card>
            <CardContent>
              {mode === "home" && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Kom i gang</h2>
                  <p className="text-muted-foreground text-sm">
                    Opprett et nytt dashboard, eller logg inn med din eksisterende ID.
                  </p>
                  <div className="grid gap-3 pt-1">
                    <Button className="w-full" onClick={() => setMode("create")}>
                      Opprett nytt dashboard
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => setMode("login")}>
                      Logg inn med ID
                    </Button>
                  </div>
                </div>
              )}

              {mode === "create" && (
                <form onSubmit={handleCreate} className="space-y-4">
                  <h2 className="text-xl font-semibold">Nytt dashboard</h2>
                  <Field>
                    <FieldLabel htmlFor="new-name">Navn på dashboardet (valgfritt)</FieldLabel>
                    <Input
                      id="new-name"
                      autoFocus
                      placeholder="F.eks. Familien Olsen"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <div className="grid gap-2">
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Oppretter…" : "Opprett"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setMode("home")}
                    >
                      Tilbake
                    </Button>
                  </div>
                </form>
              )}

              {mode === "login" && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <h2 className="text-xl font-semibold">Logg inn</h2>
                  <Field>
                    <FieldLabel htmlFor="login-id">Dashboard-ID</FieldLabel>
                    <Input
                      id="login-id"
                      autoFocus
                      className="font-mono"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                    />
                  </Field>
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <div className="grid gap-2">
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Sjekker…" : "Logg inn"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setMode("home")}
                    >
                      Tilbake
                    </Button>
                  </div>
                </form>
              )}

              {mode === "created" && createdId && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Dashboard opprettet 🎉</h2>
                  <p className="text-muted-foreground text-sm">
                    Dette er din unike ID.{" "}
                    <strong className="text-foreground">Ta vare på den</strong> — den er din eneste
                    måte å logge inn på. Det er ingen recovery.
                  </p>
                  <div className="bg-muted/40 rounded-lg border p-3">
                    <div className="font-mono text-sm break-all">{createdId}</div>
                    <Button
                      variant="outline"
                      className="mt-3 w-full"
                      size="sm"
                      onClick={copyCreatedId}
                    >
                      {copied ? <Check /> : <Copy />}
                      {copied ? "Kopiert" : "Kopier ID"}
                    </Button>
                  </div>
                  <Button className="w-full" onClick={goToDashboard}>
                    Gå til dashboardet
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="text-muted-foreground py-6 text-center text-xs">
        Bygget med TanStack Start, Tailwind og Netlify. Data lagres privat per dashboard-ID.
      </footer>
    </div>
  );
}
