import type { ReactNode } from "react";
import { Button } from "./ui/button";
import { Modal } from "./ui";

export function HistoryModal({
  open,
  onClose,
  title,
  summary,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      contentClassName="h-[min(36rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] sm:!max-w-2xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Lukk
        </Button>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {summary}
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </Modal>
  );
}
