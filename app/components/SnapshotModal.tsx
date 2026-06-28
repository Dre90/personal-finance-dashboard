/**
 * Reusable "add a snapshot at a date" modal used by both Assets and Loans.
 * Both call sites previously duplicated this entire component.
 */
import * as React from "react";
import { Modal } from "./ui";
import { useFormState } from "../lib/forms";
import { todayISO, toNumber } from "../lib/utils";

export interface SnapshotModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Label shown next to the value input, e.g. "Saldo (NOK)" or "Verdi (NOK)". */
  valueLabel: string;
  /** Pre-fill the value input — typically the previous snapshot value. */
  initialValue?: string;
  helperText?: string;
  onSubmit: (input: { snapshotDate: string; value: number }) => Promise<unknown>;
}

export function SnapshotModal({
  open,
  onClose,
  title,
  valueLabel,
  initialValue = "",
  helperText,
  onSubmit,
}: SnapshotModalProps) {
  const form = useFormState({ date: todayISO(), value: initialValue }, { resetWhen: open });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!form.values.value) return;
    setBusy(true);
    try {
      await onSubmit({
        snapshotDate: form.values.date,
        value: toNumber(form.values.value),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>
            Avbryt
          </button>
          <button onClick={save} className="btn btn-primary" disabled={busy || !form.values.value}>
            Lagre
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Dato</label>
          <input
            type="date"
            className="input"
            value={form.values.date}
            onChange={form.setField("date")}
          />
        </div>
        <div>
          <label className="label">{valueLabel}</label>
          <input
            autoFocus
            type="number"
            className="input num"
            value={form.values.value}
            onChange={form.setField("value")}
          />
        </div>
        {helperText && <p className="text-xs text-muted">{helperText}</p>}
      </div>
    </Modal>
  );
}
