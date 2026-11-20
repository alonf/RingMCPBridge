// StrykerJS 10.1.1 (T004): mutation testing of the engines, run weekly.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  mutate: [
    "bridge/src/core/engines/**/*.ts",
    "!bridge/src/core/engines/**/*.test.ts",
  ],
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  coverageAnalysis: "perTest",
  ignoreStatic: true,
};
