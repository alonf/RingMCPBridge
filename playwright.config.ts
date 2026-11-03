// Playwright 1.64.1 page smoke checks (FR-040; ui-ux U1): three widths, dark and light theme.
// The viewport sizes are assumed CSS sizes for a Galaxy Z Fold 6 (folded and unfolded) and a PC;
// the pilot checks the real phone.
import { defineConfig, devices } from "@playwright/test";

const WIDTHS = [
  { name: "fold-folded", viewport: { width: 360, height: 880 } },
  { name: "fold-unfolded", viewport: { width: 720, height: 840 } },
  { name: "pc", viewport: { width: 1440, height: 900 } },
] as const;

const THEMES = ["dark", "light"] as const;

export default defineConfig({
  testDir: "bridge/test/pages",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  projects: WIDTHS.flatMap((width) =>
    THEMES.map((theme) => ({
      name: `${width.name}-${theme}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: width.viewport,
        colorScheme: theme,
      },
    })),
  ),
});
