// dependency-cruiser 18.7.0 rules (T004; code-implementation I5.3, CD4; design constraints in plan.md).
// Run: npx depcruise bridge shim --config .dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "connector-reaches-no-cloud-libraries",
      comment:
        "From the connector's wiring, no import path reaches the Azure libraries, oidc-provider or the SQL Server driver (I5.3).",
      severity: "error",
      from: { path: "^bridge/src/host/connector\\.ts$" },
      to: {
        path: "node_modules/(@azure/|oidc-provider/|mssql/|tedious/)",
        reachable: true,
      },
    },
    {
      name: "core-reaches-no-ring-libraries",
      comment:
        "From the core's wiring, no import path reaches the Ring libraries or werift: Ring is reached only from home (S2, I5.3).",
      severity: "error",
      from: { path: "^bridge/src/host/core\\.ts$" },
      to: {
        path: "node_modules/(ring-client-api/|werift|@eneris/push-receiver/)",
        reachable: true,
      },
    },
    {
      name: "ring-library-only-in-ring-adapter",
      comment:
        "ring-client-api is imported only inside the Ring Adapter, so the Ring boundary stays swappable (S1, CD4).",
      severity: "error",
      from: {
        pathNot: "^bridge/src/connector/access/(ring-adapter|live-media)/",
      },
      to: { path: "node_modules/(ring-client-api|werift)" },
    },
    {
      name: "component-only-through-index",
      comment:
        "Another component is imported only through its index.ts; implementations are imported only by the Host wiring and the tests (CD4).",
      severity: "error",
      from: {
        path: "^(bridge/src/(?:core|connector)/[^/]+/[^/]+)/",
      },
      to: {
        path: "^bridge/src/(?:core|connector)/[^/]+/[^/]+/",
        pathNot: ["^$1/", "/index\\.ts$"],
      },
    },
    {
      name: "utility-only-through-index",
      comment:
        "A utility is imported only through its index.ts from outside its folder (CD4).",
      severity: "error",
      from: {
        path: "^bridge/src/",
        pathNot: "^bridge/src/(host/|utilities/)",
      },
      to: {
        path: "^bridge/src/utilities/[^/]+/",
        pathNot: "/index\\.ts$",
      },
    },
    {
      name: "utility-to-utility-only-through-index",
      comment: "Utilities use each other only through index.ts (CD4).",
      severity: "error",
      from: { path: "^(bridge/src/utilities/[^/]+)/" },
      to: {
        path: "^bridge/src/utilities/[^/]+/",
        pathNot: ["^$1/", "/index\\.ts$"],
      },
    },
    {
      name: "shim-imports-nothing-from-bridge",
      comment:
        "The shim talks to the bridge over MCP and shares no code with it (I5.1).",
      severity: "error",
      from: { path: "^shim/" },
      to: { path: "^bridge/" },
    },
    {
      name: "public-contract-only-in-mcp-endpoint-and-delivery",
      comment:
        "Only MCP Endpoint (and Delivery, from iteration 002) import the Public Contract (CD4 Q1).",
      severity: "error",
      from: {
        path: "^bridge/src/",
        pathNot:
          "^bridge/src/(contract/|core/clients/(mcp-endpoint|delivery)/)",
      },
      to: { path: "^bridge/src/contract/" },
    },
    {
      name: "no-circular",
      comment: "No import cycles.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment: "Every import resolves.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
      extensions: [".ts", ".js", ".mjs", ".cjs", ".d.ts"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
