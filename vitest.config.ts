// Vitest 5 (research R4; code-implementation I4).
// Unit tests sit beside the code (x.test.ts); integration and end-to-end tests live in bridge/test/.
// Coverage gate: 90% lines and 85% branches. Excluded from coverage, because CI cannot reach them:
//   - files ending in .live.ts: the real Ring Adapter, the Key Vault and managed-identity SQL
//     implementations (each talks to a real service; the pilot exercises them);
//   - the Host wiring in bridge/src/host/ (covered by the end-to-end runs).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "bridge/src/**/*.test.ts",
      "bridge/test/**/*.test.ts",
      "shim/src/**/*.test.ts",
    ],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["bridge/src/**/*.ts", "shim/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.live.ts", "bridge/src/host/**"],
      thresholds: {
        lines: 90,
        branches: 85,
      },
    },
  },
});
