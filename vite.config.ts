import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ srcDirectory: "app" }),
    netlify(),
    viteReact(),
  ],
  optimizeDeps: {
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom",
      "react-dom/client",
      "@tanstack/react-router",
      "@tanstack/react-router-devtools",
      "@tanstack/router-core",
      "@tanstack/router-core/ssr/client",
      "@tanstack/router-core/ssr/server",
      "seroval",
      "seroval-plugins/web",
      "clsx",
      "tailwind-merge",
      "uuid",
      "zod",
      "recharts",
    ],
    // Do NOT esbuild-prebundle the @tanstack/react-start server-function packages.
    // Their `createIsomorphicFn().server(...)` / `createServerOnlyFn(...)` branches are
    // stripped on the client by the TanStack Start Vite plugin transform, which the
    // esbuild dep optimizer bypasses. Prebundling them inlines the server-only
    // `node:async_hooks` (AsyncLocalStorage) import into the browser bundle and crashes
    // with "AsyncLocalStorage is not a constructor". Letting them flow through the normal
    // plugin pipeline removes the server branch (and the storage-context import) instead.
    exclude: [
      "@tanstack/react-start",
      "@tanstack/react-start/client",
      "@tanstack/start-client-core",
      "@tanstack/start-storage-context",
      "@tanstack/start-fn-stubs",
    ],
  },
  server: {
    watch: {
      ignored: ["**/.netlify/**", "**/dist/**", "**/.vite/**"],
    },
  },
});
