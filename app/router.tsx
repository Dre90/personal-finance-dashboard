import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: ({ error }) => (
      <div style={{ padding: 24 }}>
        <h2>Noe gikk galt</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>{String(error)}</pre>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div style={{ padding: 24 }}>
        <h2>Siden finnes ikke</h2>
        <p>
          <a href="/">Gå til forsiden</a>
        </p>
      </div>
    ),
    scrollRestoration: true,
  });
  return router;
}

export function getRouter() {
  return createRouter();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
