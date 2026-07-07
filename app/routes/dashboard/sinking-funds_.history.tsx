import { createFileRoute } from "@tanstack/react-router";
import { SinkingFundsHistoryPage } from "~/features/sinking-funds/HistoryPage";

export const Route = createFileRoute("/dashboard/sinking-funds_/history")({
  component: SinkingFundsHistoryPage,
});
