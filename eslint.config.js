// ESLint 10 flat config (research R3; code-implementation I2, I7).
// typescript-eslint strictTypeChecked + stylisticTypeChecked with typed linting everywhere,
// the project's naming rules N2 to N4, and Prettier owning the formatting.
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const MAX_LOGIC_DEPTH = 3; // ESLint counts a try block; I3 puts one at each client edge (I7.1)

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "coverage/",
    "test-results/",
    "playwright-report/",
    "reports/",
    "research_notes/",
    "specs/",
    "scripts/internal/",
    ".agents/",
    ".claude/",
    ".copilot/",
    ".cursor/",
    ".github/",
    ".specify/",
    ".specrew/",
    ".squad/",
    ".vscode/",
  ]),
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "max-depth": ["error", MAX_LOGIC_DEPTH],
      // N2: named exports only.
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      // N3 and N4: PascalCase types, camelCase values, UPPER_SNAKE module constants, no I prefix.
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        { selector: "import", format: ["camelCase", "PascalCase"] },
        { selector: "typeLike", format: ["PascalCase"] },
        {
          selector: "interface",
          format: ["PascalCase"],
          custom: { regex: "^I[A-Z]", match: false },
        },
        {
          selector: "variable",
          modifiers: ["const", "global"],
          format: ["camelCase", "UPPER_CASE"],
        },
        { selector: "variable", modifiers: ["destructured"], format: null },
        // Contract and wire fields are snake_case (contracts/); quoted keys are left alone.
        {
          selector: ["objectLiteralProperty", "typeProperty"],
          format: ["camelCase", "snake_case", "UPPER_CASE"],
        },
        {
          selector: ["objectLiteralProperty", "typeProperty"],
          modifiers: ["requiresQuotes"],
          format: null,
        },
      ],
    },
  },
  {
    // N2: the root tool config files need a default export.
    files: ["*.config.{js,ts,cjs,mjs}"],
    rules: { "no-restricted-exports": "off" },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
