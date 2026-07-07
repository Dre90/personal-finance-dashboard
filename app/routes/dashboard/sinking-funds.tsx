import { createFileRoute } from "@tanstack/react-router";
import { SinkingFundsPage } from "~/features/sinking-funds/SinkingFundsPage";

export const Route = createFileRoute("/dashboard/sinking-funds")({
  component: SinkingFundsPage,
});
