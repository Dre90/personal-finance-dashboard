import { Link } from "@tanstack/react-router";
import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { LoadingPlaceholder, PageHeader } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Field, FieldLabel } from "../../components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { listSinkingFunds, listSinkingFundTransactions } from "~/features/sinking-funds/server";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { cn, formatNOK } from "../../lib/utils";
import type { SinkingFund, SinkingFundTransaction } from "../../../db/schema";

type KindFilter = "all" | "deposit" | "withdrawal" | "adjustment" | "opening";

const KIND_ITEMS: Record<KindFilter, string> = {
  all: "Alle",
  deposit: "Innskudd",
  withdrawal: "Uttak",
  adjustment: "Justering",
  opening: "Startbeholdning",
};

export function SinkingFundsHistoryPage() {
  const { id: dashboardId } = useDashboard();
  const [fundFilter, setFundFilter] = React.useState<number | "all">("all");
  const [kindFilter, setKindFilter] = React.useState<KindFilter>("all");
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  const fundsQuery = useQuery({
    key: ["sinking-funds", dashboardId],
    fn: () => listSinkingFunds({ data: { dashboardId } }),
  });

  const txnsQuery = useQuery({
    key: ["sinking-fund-txns", dashboardId, fundFilter, kindFilter, from, to],
    fn: () =>
      listSinkingFundTransactions({
        data: {
          dashboardId,
          sinkingFundId: fundFilter === "all" ? undefined : fundFilter,
          kind: kindFilter === "all" ? undefined : kindFilter,
          from: from || undefined,
          to: to || undefined,
        },
      }),
  });

  if (fundsQuery.isInitialLoading || txnsQuery.isInitialLoading) return <LoadingPlaceholder />;
  const funds = fundsQuery.data ?? [];
  const filtered = txnsQuery.data ?? [];
  const fundById = new Map(funds.map((f) => [f.id, f]));
  const fundItems: Record<string, string> = {
    all: "Alle",
    ...Object.fromEntries(funds.map((f) => [String(f.id), f.name])),
  };

  // Group consecutive rows sharing an allocationGroupId into visual bands.
  const groups: Array<
    | { type: "single"; txn: SinkingFundTransaction }
    | { type: "group"; id: string; txns: SinkingFundTransaction[] }
  > = [];
  let i = 0;
  while (i < filtered.length) {
    const t = filtered[i]!;
    if (t.allocationGroupId) {
      const groupId = t.allocationGroupId;
      const bucket: SinkingFundTransaction[] = [];
      while (i < filtered.length && filtered[i]!.allocationGroupId === groupId) {
        bucket.push(filtered[i]!);
        i++;
      }
      groups.push({ type: "group", id: groupId, txns: bucket });
    } else {
      groups.push({ type: "single", txn: t });
      i++;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historikk — sinking funds"
        subtitle="Alle innskudd og uttak på tvers av fond"
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/dashboard/sinking-funds" />}
          >
            <ArrowLeft />
            Tilbake
          </Button>
        }
      />

      <Card>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="filter-fund">Fond</FieldLabel>
              <Select
                items={fundItems}
                value={fundFilter === "all" ? "all" : String(fundFilter)}
                onValueChange={(v) => setFundFilter(v === "all" ? "all" : Number(v))}
              >
                <SelectTrigger id="filter-fund" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Alle</SelectItem>
                    {funds.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-kind">Type</FieldLabel>
              <Select
                items={KIND_ITEMS}
                value={kindFilter}
                onValueChange={(v) => setKindFilter(v as KindFilter)}
              >
                <SelectTrigger id="filter-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(KIND_ITEMS) as KindFilter[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_ITEMS[k]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-from">Fra dato</FieldLabel>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="filter-to">Til dato</FieldLabel>
              <Input
                id="filter-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ingen transaksjoner som matcher filteret.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            if (g.type === "single") {
              return (
                <SingleRow
                  key={`single-${g.txn.id}`}
                  txn={g.txn}
                  fund={fundById.get(g.txn.sinkingFundId)}
                />
              );
            }
            const total = g.txns.reduce((s, t) => s + Number(t.amount), 0);
            const occurredAt = g.txns[0]?.occurredAt ?? "";
            return (
              <Card key={`group-${g.id}`} className="border-l-primary border-l-4">
                <CardContent>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold">Fordeling {occurredAt}</span>
                      {g.txns[0]?.note && (
                        <span className="text-muted-foreground ml-2">· {g.txns[0].note}</span>
                      )}
                    </div>
                    <span className="text-success font-semibold tabular-nums">
                      + {formatNOK(total)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {g.txns.map((t) => {
                      const fund = fundById.get(t.sinkingFundId);
                      return (
                        <li
                          key={t.id}
                          className="text-muted-foreground flex items-center gap-3 pl-2 text-sm"
                        >
                          <span
                            className="size-2 flex-none rounded-full"
                            style={{ background: fund?.color ?? "#888" }}
                          />
                          <span className="text-foreground flex-1 truncate">
                            {fund?.name ?? "(slettet)"}
                          </span>
                          <span className="text-success tabular-nums">+ {formatNOK(t.amount)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SingleRow({ txn, fund }: { txn: SinkingFundTransaction; fund: SinkingFund | undefined }) {
  const amount = Number(txn.amount);
  const positive = amount >= 0;
  const label =
    txn.kind === "opening"
      ? "Startbeholdning"
      : txn.kind === "adjustment"
        ? "Justering"
        : positive
          ? "Innskudd"
          : "Uttak";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground w-24 flex-none tabular-nums">{txn.occurredAt}</span>
        <span
          className="size-3 flex-none rounded-full"
          style={{ background: fund?.color ?? "#888" }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate">
            {fund?.name ?? "(slettet)"}
            <span className="text-muted-foreground ml-2 text-xs">· {label}</span>
          </div>
          {txn.note && <div className="text-muted-foreground truncate text-xs">{txn.note}</div>}
        </div>
        <span
          className={cn(
            "w-28 flex-none text-right font-semibold tabular-nums",
            positive ? "text-success" : "text-destructive",
          )}
        >
          {positive ? "+" : "−"} {formatNOK(Math.abs(amount))}
        </span>
      </CardContent>
    </Card>
  );
}
