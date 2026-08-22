import { defineWorkspace } from "vitest/config";

/**
 * Two projects, because they need two different environments — and because a
 * single config cannot give them two different setup files.
 *
 * That is not a stylistic preference. `setupFiles` in a shared config runs for
 * *every* test file, so the jsdom shims the component tests need were being
 * loaded into the node tests as well, where `Element` does not exist. Every
 * pure test in `packages` failed to collect. A workspace is the supported way
 * to keep the two apart.
 */
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "packages",
      environment: "node",
      include: ["packages/**/*.test.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "web",
      // A `.test.tsx` renders something, so it gets a DOM. Nothing in
      // `packages` does, and none of it should pay for one.
      environment: "jsdom",
      include: ["apps/web/**/*.test.tsx"],
      setupFiles: ["./apps/web/vitest.setup.ts"],
    },
  },
]);
