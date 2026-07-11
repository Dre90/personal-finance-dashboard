/**
 * Reusable "add a snapshot at a date" modal used by both Assets and Loans.
 * Both call sites previously duplicated this entire component.
 */
import * as React from "react";
import { Modal } from "./ui";
import { Button } from "./ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
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
  /** Pre-fill the date input — typically an existing snapshot's date. */
  initialDate?: string;
  /** Keep an existing snapshot associated with its original date when editing. */
  dateDisabled?: boolean;
  helperText?: string;
  onSubmit: (input: { snapshotDate: string; value: number }) => Promise<unknown>;
}

export function SnapshotModal({
  open,
  onClose,
  title,
  valueLabel,
  initialValue = "",
  initialDate = todayISO(),
  dateDisabled = false,
  helperText,
  onSubmit,
}: SnapshotModalProps) {
  const form = useFormState(
    { date: initialDate, value: initialValue },
    { resetWhen: open ? `${initialDate}-${initialValue}` : null },
  );
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
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Avbryt
          </Button>
          <Button onClick={save} disabled={busy || !form.values.value}>
            Lagre
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="snapshot-date">Dato</FieldLabel>
          <Input
            id="snapshot-date"
            type="date"
            value={form.values.date}
            onChange={form.setField("date")}
            disabled={dateDisabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="snapshot-value">{valueLabel}</FieldLabel>
          <Input
            id="snapshot-value"
            autoFocus
            type="number"
            className="tabular-nums"
            value={form.values.value}
            onChange={form.setField("value")}
          />
          {helperText && <FieldDescription>{helperText}</FieldDescription>}
        </Field>
      </FieldGroup>
    </Modal>
  );
}
