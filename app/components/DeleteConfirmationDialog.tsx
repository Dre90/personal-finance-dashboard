import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";

type DeleteConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmLabel?: string;
};

export function DeleteConfirmationDialog({
  open,
  title,
  description,
  onOpenChange,
  onConfirm,
  busy = false,
  confirmLabel = "Slett",
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg" disabled={busy}>
            Avbryt
          </AlertDialogCancel>
          <AlertDialogAction size="lg" variant="destructive" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
