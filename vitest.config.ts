import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Minimal .env.local reader — enough for the handful of keys tests need. */
function loadEnvLocal(): Record<string, string> {
  try {
    const text = readFileSync(r("./.env.local"), "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

export default defineConfig({
  test: {
    // No `include` here on purpose. The projects in vitest.workspace.ts each
    // declare their own, and `extends` *merges* arrays rather than replacing
    // them — leaving one here silently ran every package test a second time,
    // inside the jsdom project.
    environment: "node",
    // Integration tests need a real database; they skip themselves when
    // DATABASE_URL is absent, so this stays optional.
    env: loadEnvLocal(),
    // A round trip to a hosted Postgres is slower than a pure-function test.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["packages/accounting/src/**", "packages/shared/src/**"],
      // The money and posting logic is the one place we do not tolerate gaps.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
  // esbuild handles the JSX, so @vitejs/plugin-react is not needed — and its
  // current major wants a Vite that vitest 2 does not ship.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@hishabai/shared": r("./packages/shared/src/index.ts"),
      "@hishabai/accounting": r("./packages/accounting/src/index.ts"),
      // The same `@/` the web app's tsconfig maps.
      "@": r("./apps/web/src"),
    },
  },
});
