// The admin page's look (T029; UX U1, U5): the bridge's own small design system, as CSS variables
// for each theme, cards and status badges. Dark is the default, with a light theme the owner can
// switch to. One layout for three widths: the Fold 6 folded (one column, a menu button), unfolded
// (a side menu beside the content), and a PC (a side menu, and the health as a card grid). The
// colours are data, so a test checks their contrast in both themes.

/** The two themes. Dark is the default. */
export type Theme = "dark" | "light";

/** One theme's colours. */
export interface ThemeTokens {
  readonly bg: string;
  readonly surface: string;
  readonly raised: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly link: string;
  readonly ok: string;
  readonly warn: string;
  readonly bad: string;
  readonly badBg: string;
  readonly warnBg: string;
  readonly focus: string;
}

/** The themes' colours. */
export const THEME_TOKENS: Readonly<Record<Theme, ThemeTokens>> = {
  dark: {
    bg: "#0d1117",
    surface: "#161b22",
    raised: "#1f2630",
    border: "#30394a",
    text: "#e9edf2",
    muted: "#a4afbd",
    accent: "#2f6fe4",
    onAccent: "#ffffff",
    link: "#8ab4ff",
    ok: "#4ade80",
    warn: "#fbbf24",
    bad: "#fb7d7d",
    badBg: "#3b1d22",
    warnBg: "#372b12",
    focus: "#93c5fd",
  },
  light: {
    bg: "#f4f6f9",
    surface: "#ffffff",
    raised: "#eef2f7",
    border: "#cdd5e0",
    text: "#111820",
    muted: "#4a5565",
    accent: "#1f5fd1",
    onAccent: "#ffffff",
    link: "#1f5fd1",
    ok: "#13703a",
    warn: "#8a5800",
    bad: "#b42318",
    badBg: "#fde8e7",
    warnBg: "#fdf3dc",
    focus: "#1f5fd1",
  },
};

function variables(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([name, value]: [string, string]) => `--${name}: ${value};`)
    .join(" ");
}

/** The stylesheet, served at its own path: the page's policy allows no inline style. */
export const STYLESHEET = `
:root, :root[data-theme="dark"] { ${variables(THEME_TOKENS.dark)} color-scheme: dark; }
:root[data-theme="light"] { ${variables(THEME_TOKENS.light)} color-scheme: light; }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
a { color: var(--link); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.skip { position: absolute; left: -999px; }
.skip:focus { left: 1rem; top: 1rem; z-index: 2; background: var(--surface); padding: 0.5rem 1rem; }

.top {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--surface); border-bottom: 1px solid var(--border);
}
.brand { font-weight: 700; font-size: 1.1rem; margin-right: auto; }
.top form { margin: 0; }

button, .button {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  min-height: 44px; padding: 0.5rem 1rem;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--raised); color: var(--text);
  font: inherit; font-weight: 600; text-decoration: none; cursor: pointer;
}
.primary { background: var(--accent); border-color: var(--accent); color: var(--onAccent); }

.menu { padding: 0 1rem; }
.menu summary {
  display: inline-flex; align-items: center; min-height: 44px; margin: 0.5rem 0;
  padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 10px;
  background: var(--raised); font-weight: 600; cursor: pointer;
}
.nav-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
.nav-list a {
  display: flex; align-items: center; min-height: 44px; padding: 0.5rem 0.75rem;
  border-radius: 8px; color: var(--text); text-decoration: none;
}
.nav-list a:hover { background: var(--raised); }
.side { display: none; }

.shell { display: grid; grid-template-columns: minmax(0, 1fr); }
main { padding: 1rem; display: grid; gap: 1rem; align-content: start; min-width: 0; }

.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 1rem;
}
.card h2 { margin: 0; font-size: 1.15rem; }
.card-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1rem; margin-bottom: 0.75rem; }
.as-of { color: var(--muted); font-size: 0.9rem; }
.card-head .button { margin-left: auto; }

.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.row {
  display: grid; grid-template-columns: minmax(6.5rem, auto) 1fr; gap: 0.25rem 0.75rem;
  align-items: center; padding: 0.6rem 0.75rem;
  background: var(--raised); border-radius: 10px;
}
.row-label { font-weight: 600; }
.row-detail { grid-column: 1 / -1; color: var(--muted); font-size: 0.9rem; }

.badge { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 700; }
.badge svg { width: 1.1em; height: 1.1em; flex: none; }
.tone-ok { color: var(--ok); }
.tone-warn { color: var(--warn); }
.tone-bad { color: var(--bad); }
.tone-none { color: var(--muted); }

.banner {
  display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.6rem; align-items: start;
  padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--border);
}
.banner p { margin: 0; grid-column: 2; }
.banner strong { grid-column: 2; }
.banner svg { width: 1.3em; height: 1.3em; grid-row: 1 / span 2; margin-top: 0.1rem; }
.banner-bad { background: var(--badBg); }
.banner-bad svg { color: var(--bad); }
.banner-warn { background: var(--warnBg); }
.banner-warn svg { color: var(--warn); }
.banner-ok svg { color: var(--ok); }
.banners { display: grid; gap: 0.5rem; margin-bottom: 0.75rem; }

.code {
  font: 700 clamp(1.6rem, 7vw, 2.4rem)/1.2 ui-monospace, "Cascadia Mono", Consolas, monospace;
  letter-spacing: 0.08em; margin: 0.5rem 0;
}
.field { display: grid; gap: 0.35rem; margin: 0.75rem 0; max-width: 22rem; }
.field input {
  min-height: 44px; padding: 0.5rem 0.75rem; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg); color: var(--text);
  font: 600 1.2rem ui-monospace, "Cascadia Mono", Consolas, monospace; letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hint { color: var(--muted); font-size: 0.9rem; margin: 0; }
.signed-out { max-width: 32rem; margin: 3rem auto; }
.page-title { margin: 0; font-size: 1.35rem; }
h1 { font-size: 1.35rem; margin: 0 0 0.75rem; }

@media (min-width: 600px) {
  .menu { display: none; }
  .shell { grid-template-columns: 11rem minmax(0, 1fr); }
  .side { display: block; padding: 1rem 0.5rem; border-right: 1px solid var(--border); min-height: calc(100vh - 70px); }
  main { padding: 1.25rem; }
}
@media (min-width: 1000px) {
  .shell { grid-template-columns: 13rem minmax(0, 1fr); }
  .rows { grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 0.75rem; }
  .row { padding: 0.9rem 1rem; }
}
`;
