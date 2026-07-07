import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader } from "../../components/ui";
import { deleteDashboard, exportDashboard, updateDashboard } from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { clearQueryCache, useMutation } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { clearStoredDashboardId } from "../../lib/auth";
import { useTheme } from "../../lib/theme-context";
import type { ThemePreference } from "../../lib/theme";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Lyst" },
  { value: "dark", label: "Mørkt" },
];

function SettingsPage() {
  const { id, dashboard, refetch } = useDashboard();
  const navigate = useNavigate();
  const toast = useToast();
  const { preference, setPreference } = useTheme();
  const [name, setName] = React.useState(dashboard.name);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setName(dashboard.name);
  }, [dashboard.name]);

  const renameMutation = useMutation({
    fn: () => updateDashboard({ data: { dashboardId: id, name: name.trim() } }),
    onSuccess: async () => {
      await refetch();
      toast.push("Navn lagret", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const exportMutation = useMutation({
    fn: () => exportDashboard({ data: { dashboardId: id } }),
    onSuccess: (dump) => {
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `okonomi-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("Eksportert", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteMutation = useMutation({
    fn: () => deleteDashboard({ data: { dashboardId: id } }),
    onSuccess: () => {
      clearStoredDashboardId();
      clearQueryCache();
      void navigate({ to: "/" });
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function confirmDelete() {
    const v = prompt("Dette sletter ALT permanent. Skriv 'SLETT' for å bekrefte:");
    if (v === "SLETT") void deleteMutation.mutate(undefined);
  }

  const canRename = name.trim().length > 0 && name.trim() !== dashboard.name;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Innstillinger" />

      <div className="card space-y-3">
        <h3 className="font-semibold">Dashboard-ID</h3>
        <p className="text-sm text-muted">
          Denne ID-en er din eneste nøkkel. Lagre den et trygt sted — det finnes ingen recovery.
        </p>
        <div className="card-soft font-mono text-sm break-all">{id}</div>
        <button onClick={copyId} className="btn btn-ghost text-xs">
          {copied ? "✓ Kopiert" : "Kopier ID"}
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Navn</h3>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <button
            onClick={() => void renameMutation.mutate(undefined)}
            disabled={renameMutation.loading || !canRename}
            className="btn btn-primary"
          >
            {renameMutation.loading ? "Lagrer…" : "Lagre navn"}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Utseende</h3>
        <p className="text-sm text-muted">
          Velg tema. «Auto» følger systeminnstillingen din. Lagres på denne enheten.
        </p>
        <div className="inline-flex rounded-[10px] border border-app bg-soft p-1 gap-1">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPreference(opt.value)}
              aria-pressed={preference === opt.value}
              className={
                "btn text-sm px-4 py-1.5 " +
                (preference === opt.value ? "btn-primary" : "btn-ghost border-transparent")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Eksporter data</h3>
        <p className="text-sm text-muted">
          Last ned alle dataene som JSON. God idé å gjøre dette med jevne mellomrom som backup.
        </p>
        <button
          onClick={() => void exportMutation.mutate(undefined)}
          disabled={exportMutation.loading}
          className="btn btn-primary"
        >
          {exportMutation.loading ? "Eksporterer…" : "Last ned JSON"}
        </button>
      </div>

      <div className="card space-y-3 border-red-900/50">
        <h3 className="font-semibold text-red-400">Faresone</h3>
        <p className="text-sm text-muted">
          Slett hele dashboardet og alle dataene permanent. Kan ikke angres.
        </p>
        <button
          onClick={confirmDelete}
          className="btn btn-danger"
          disabled={deleteMutation.loading}
        >
          {deleteMutation.loading ? "Sletter…" : "Slett dashboard for alltid"}
        </button>
      </div>
    </div>
  );
}
