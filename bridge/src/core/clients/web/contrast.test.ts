// Readable contrast in both themes (T029; FR-040; UX U5): each colour pair the page uses for text is
// at least 4.5:1, WCAG 2.2's level AA for normal text, and the focus ring at least 3:1 against
// the page, its level for non-text parts. Worked out from the theme tokens the stylesheet is built
// from, with WCAG's relative luminance.
import { describe, expect, it } from "vitest";
import { THEME_TOKENS } from "./index.ts";
import type { Theme, ThemeTokens } from "./index.ts";

const TEXT_RATIO = 4.5;
const NON_TEXT_RATIO = 3;
const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const CHANNEL_MAX = 255;
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const FLARE = 0.05;

function luminance(colour: string): number {
  const match = HEX_COLOUR.exec(colour);
  if (match === null) {
    throw new Error(`${colour} is not a six-digit hex colour.`);
  }
  const [red, green, blue] = [match[1], match[2], match[3]].map((hex) => {
    const channel = Number.parseInt(hex ?? "0", 16) / CHANNEL_MAX;
    return channel <= LINEAR_THRESHOLD
      ? channel / LINEAR_DIVISOR
      : ((channel + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA;
  });
  return (
    RED_WEIGHT * (red ?? 0) +
    GREEN_WEIGHT * (green ?? 0) +
    BLUE_WEIGHT * (blue ?? 0)
  );
}

function ratio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return ((light ?? 0) + FLARE) / ((dark ?? 0) + FLARE);
}

// Each text colour on each background it is shown on.
const TEXT_PAIRS: readonly (readonly [keyof ThemeTokens, keyof ThemeTokens])[] =
  [
    ["text", "bg"],
    ["text", "surface"],
    ["text", "raised"],
    ["text", "badBg"],
    ["text", "warnBg"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["muted", "raised"],
    ["link", "surface"],
    ["link", "badBg"],
    ["link", "warnBg"],
    ["onAccent", "accent"],
    ["ok", "raised"],
    ["warn", "raised"],
    ["bad", "raised"],
    ["ok", "surface"],
  ];

const THEMES: readonly Theme[] = ["dark", "light"];

describe("the admin page's contrast", () => {
  it.each(THEMES)(
    "keeps every text colour readable in the %s theme",
    (theme) => {
      const tokens = THEME_TOKENS[theme];
      const weak = TEXT_PAIRS.filter(
        ([foreground, background]) =>
          ratio(tokens[foreground], tokens[background]) < TEXT_RATIO,
      ).map(([foreground, background]) => `${foreground} on ${background}`);

      expect(weak).toEqual([]);
    },
  );

  it.each(THEMES)("keeps the focus ring visible in the %s theme", (theme) => {
    const tokens = THEME_TOKENS[theme];

    for (const background of ["bg", "surface", "raised"] as const) {
      expect(ratio(tokens.focus, tokens[background])).toBeGreaterThanOrEqual(
        NON_TEXT_RATIO,
      );
    }
  });

  it("works out WCAG's own examples", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
