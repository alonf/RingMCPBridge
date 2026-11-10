// The admin page's templates (T029; FR-040; UX U1-U5): pure functions of their data, written with
// hono's `html` helper, which escapes every value it is given. What comes from the home (the
// enrollment code, the connector's version) is such a value, never raw markup. Every status shows
// as a word and an icon, and every value with its time. English only.
import { html } from "hono/html";
import type { HealthPanel, Banner, StatusRow, Tone } from "./health-panel.ts";
import type { Notice } from "./owner-sessions.ts";
import type { Theme } from "./styles.ts";

type Html = ReturnType<typeof html>;

/** Where the page's parts are served. */
export interface PagePaths {
  readonly page: string;
  readonly signIn: string;
  readonly signOut: string;
  readonly approve: string;
  readonly theme: string;
  readonly stylesheet: string;
  readonly script: string;
}

/** Why the sign-in page is shown again, as the owner reads it. */
export type SignInProblem =
  | "refused"
  | "not_owner"
  | "unavailable"
  | "invalid"
  | "expired"
  | "other_browser"
  | "signed_out";

/** The Enroll section's content. */
export type EnrollPanel =
  | { readonly kind: "none" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "waiting";
      readonly keyId: string;
      readonly code: string;
      /** Until when the request waits, in the home's time. */
      readonly expiresAt: string;
      /** Whether the owner's sign-in is under 5 minutes old, so the form is shown. */
      readonly fresh: boolean;
    };

/** The longest confirmation the form takes: a code with room for spaces. */
export const CONFIRMATION_MAX_LENGTH = 32;
// Letters, digits, the dash and spaces; the browser's pattern syntax wants the dash escaped.
const CONFIRMATION_PATTERN = "[0-9A-Za-z\\- ]+";

const ICONS: Readonly<Record<Tone, Html>> = {
  ok: html`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.4-4.2-4.2 1.4-1.4 2.8 2.8 5.8-5.8 1.4 1.4-7.2 7.2Z"
    />
  </svg>`,
  warn: html`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z"
    />
  </svg>`,
  bad: html`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.2 12.8-1.4 1.4L12 13.4l-2.8 2.8-1.4-1.4 2.8-2.8-2.8-2.8 1.4-1.4 2.8 2.8 2.8-2.8 1.4 1.4-2.8 2.8 2.8 2.8Z"
    />
  </svg>`,
  none: html`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z"
    />
  </svg>`,
};

const SIGN_IN_PROBLEMS: Readonly<
  Record<SignInProblem, { readonly tone: Tone; readonly text: string }>
> = {
  refused: {
    tone: "warn",
    text: "The sign-in was cancelled or refused. Try again.",
  },
  not_owner: {
    tone: "bad",
    text: "Only the bridge's owner can open this page.",
  },
  unavailable: {
    tone: "warn",
    text: "Microsoft sign-in is not answering. Try again in a few minutes.",
  },
  invalid: {
    tone: "warn",
    text: "The sign-in could not be checked. Try again.",
  },
  expired: { tone: "warn", text: "That sign-in has ended. Sign in again." },
  other_browser: {
    tone: "warn",
    text: "The sign-in finished in a different browser. Sign in again from this one.",
  },
  signed_out: { tone: "ok", text: "You are signed out." },
};

const NOTICES: Readonly<
  Record<
    Exclude<Notice["kind"], "approved">,
    { readonly tone: Tone; readonly text: string }
  >
> = {
  not_pending: {
    tone: "warn",
    text: "That request has ended, or a newer one replaced it. Nothing was approved. Compare the code shown now.",
  },
  code_mismatch: {
    tone: "bad",
    text: "The code you typed does not match the request's. Nothing was approved. Check the connector's log, then type its code again.",
  },
  sign_in_stale: {
    tone: "warn",
    text: "Your sign-in is more than 5 minutes old, so nothing was approved. Sign in again, then approve.",
  },
  not_serving: {
    tone: "warn",
    text: "This core is not serving right now, so nothing was approved. Try again in a minute.",
  },
  unavailable: {
    tone: "bad",
    text: "The bridge's database did not answer, so nothing was approved. Try again in a moment.",
  },
};

/** The page shown to anyone not signed in. */
export function signInPage(view: {
  readonly paths: PagePaths;
  readonly theme: Theme;
  readonly problem: SignInProblem | undefined;
}): Html {
  const problem =
    view.problem === undefined ? undefined : SIGN_IN_PROBLEMS[view.problem];
  return frame({
    paths: view.paths,
    theme: view.theme,
    title: "Sign in · Ring MCP Bridge",
    formToken: undefined,
    body: html`<main id="main" class="signed-out">
      <section class="card" aria-labelledby="sign-in-title">
        <h1 id="sign-in-title">Admin page</h1>
        ${problem === undefined ? "" : message(problem.tone, problem.text)}
        <p>
          Only the bridge's owner can open this page. Sign in with your
          Microsoft account; it asks for your password again.
        </p>
        <a class="button primary" href="${view.paths.signIn}">Sign in</a>
      </section>
    </main>`,
  });
}

/** The admin page for the signed-in owner. */
export function adminPage(view: {
  readonly paths: PagePaths;
  readonly theme: Theme;
  readonly formToken: string;
  readonly health: HealthPanel;
  readonly enroll: EnrollPanel;
  readonly notice: Notice | undefined;
}): Html {
  return frame({
    paths: view.paths,
    theme: view.theme,
    title: "Admin · Ring MCP Bridge",
    formToken: view.formToken,
    body: html`<details class="menu">
        <summary>Menu</summary>
        ${navigation(view.paths, "Sections menu")}
      </details>
      <div class="shell">
        <div class="side">${navigation(view.paths, "Sections")}</div>
        <main id="main">
          ${view.notice === undefined ? "" : notice(view.notice)}
          ${healthSection(view.health, view.paths)}
          ${enrollSection(view.enroll, view.formToken, view.paths)}
        </main>
      </div>`,
  });
}

/** The Health section alone: in the page, and as the poll's answer. */
export function healthSection(panel: HealthPanel, paths: PagePaths): Html {
  return html`<section id="health" class="card" aria-labelledby="health-title">
    <div class="card-head">
      <h2 id="health-title">Health</h2>
      ${panel.asOf === undefined ? "" : html`<span class="as-of">as of ${panel.asOf}</span>`}<a
        class="button"
        href="${paths.page}#health"
        >Refresh</a
      >
    </div>
    ${panel.banners.length === 0 ? "" : html`<div class="banners">${panel.banners.map(banner)}</div>`}
    ${
      panel.rows.length === 0
        ? html`<p class="hint">No health could be read.</p>`
        : html`<ul class="rows">
            ${panel.rows.map(row)}
          </ul>`
    }
  </section>`;
}

/** The poll's answer once the session has ended. */
export function signedOutHealth(paths: PagePaths): Html {
  return html`<section id="health" class="card" aria-labelledby="health-title">
    <div class="card-head"><h2 id="health-title">Health</h2></div>
    <div class="banner banner-warn">
      ${ICONS.warn}<strong>You are signed out</strong>
      <p>
        Your session ended. <a href="${paths.page}">Sign in again</a> to see the
        health.
      </p>
    </div>
  </section>`;
}

/** A page for a request the admin page cannot take, such as a form from another site. */
export function refusedPage(view: {
  readonly paths: PagePaths;
  readonly theme: Theme;
  readonly text: string;
}): Html {
  return frame({
    paths: view.paths,
    theme: view.theme,
    title: "Not done · Ring MCP Bridge",
    formToken: undefined,
    body: html`<main id="main" class="signed-out">
      <section class="card" aria-labelledby="refused-title">
        <h1 id="refused-title">Nothing was done</h1>
        ${message("bad", view.text)}
        <a class="button" href="${view.paths.page}">Back to the admin page</a>
      </section>
    </main>`,
  });
}

function frame(view: {
  readonly paths: PagePaths;
  readonly theme: Theme;
  readonly title: string;
  readonly formToken: string | undefined;
  readonly body: Html;
}): Html {
  const other: Theme = view.theme === "light" ? "dark" : "light";
  return html`<!doctype html>
    <html lang="en" data-theme="${view.theme}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${view.title}</title>
        <link rel="stylesheet" href="${view.paths.stylesheet}" />
        <script src="${view.paths.script}" defer></script>
      </head>
      <body data-signed-in="${view.formToken === undefined ? "no" : "yes"}">
        <a class="skip" href="#main">Skip to the content</a>
        <header class="top">
          <span class="brand">Ring MCP Bridge</span>
          <form method="post" action="${view.paths.theme}" data-theme-switch>
            <input type="hidden" name="theme" value="${other}" /><button
              type="submit"
            >
              ${other === "light" ? "Light theme" : "Dark theme"}
            </button>
          </form>
          ${view.formToken === undefined ? "" : html`<form method="post" action="${view.paths.signOut}"><input type="hidden" name="form_token" value="${view.formToken}" /><button type="submit">Sign out</button></form>`}
        </header>
        ${view.body}
      </body>
    </html>`;
}

function navigation(paths: PagePaths, label: string): Html {
  return html`<nav aria-label="${label}">
    <ul class="nav-list">
      <li><a href="${paths.page}#health">Health</a></li>
      <li><a href="${paths.page}#enroll">Enroll connector</a></li>
    </ul>
  </nav>`;
}

function enrollSection(
  panel: EnrollPanel,
  formToken: string,
  paths: PagePaths,
): Html {
  return html`<section id="enroll" class="card" aria-labelledby="enroll-title">
    <div class="card-head"><h2 id="enroll-title">Enroll connector</h2></div>
    ${enrollBody(panel, formToken, paths)}
  </section>`;
}

function enrollBody(
  panel: EnrollPanel,
  formToken: string,
  paths: PagePaths,
): Html {
  switch (panel.kind) {
    case "none":
      return html`<p>
        No connector is asking to enroll. After you run the setup and start the
        connector, its request shows here for 10 minutes.
      </p>`;
    case "unavailable":
      return message(
        "bad",
        "The enrollment request could not be read: the bridge's database did not answer. Reload the page in a moment.",
      );
    case "waiting":
      return html`<p>
          A connector asks to enroll. Compare this code with the one the setup
          printed and the connector's log shows:
        </p>
        <p class="code">${panel.code}</p>
        <p class="hint">
          The request waits until ${panel.expiresAt}. Approving makes this
          connector the home's only one: any older connector key is revoked.
        </p>
        ${panel.fresh ? approveForm(panel.keyId, formToken, paths) : signInAgain(paths)}`;
  }
}

function approveForm(keyId: string, formToken: string, paths: PagePaths): Html {
  return html`<form method="post" action="${paths.approve}">
    <input type="hidden" name="form_token" value="${formToken}" />
    <input type="hidden" name="key_id" value="${keyId}" />
    <div class="field">
      <label for="confirmation"
        >Type the code from the connector's log to approve</label
      >
      <input
        id="confirmation"
        name="confirmation"
        required
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        maxlength="${CONFIRMATION_MAX_LENGTH}"
        pattern="${CONFIRMATION_PATTERN}"
        aria-describedby="confirmation-hint"
      />
    </div>
    <p id="confirmation-hint" class="hint">
      Letters and digits; the dash and spaces may be left out.
    </p>
    <button class="primary" type="submit">Approve</button>
  </form>`;
}

function signInAgain(paths: PagePaths): Html {
  return html`<p>
      Approving needs a sign-in less than 5 minutes old. Sign in again, then
      compare and approve.
    </p>
    <a class="button primary" href="${paths.signIn}?then=enroll"
      >Sign in again</a
    >`;
}

function notice(shown: Notice): Html {
  if (shown.kind === "approved") {
    const revoked =
      shown.revoked === 0
        ? ""
        : ` ${String(shown.revoked)} older connector key${shown.revoked === 1 ? " was" : "s were"} revoked.`;
    return message(
      "ok",
      `Approved. The connector links within a minute.${revoked}`,
      "status",
    );
  }
  const { tone, text } = NOTICES[shown.kind];
  return message(tone, text, "status");
}

function message(tone: Tone, text: string, role?: "status"): Html {
  const shade = tone === "none" ? "warn" : tone;
  return html`<div
    class="banner banner-${shade}"
    ${role === undefined ? "" : html` role="${role}"`}
  >
    ${ICONS[tone]}
    <p>${text}</p>
  </div>`;
}

function banner(shown: Banner): Html {
  return html`<div class="banner banner-${shown.tone}">
    ${ICONS[shown.tone]}<strong>${shown.title}</strong>
    <p>${shown.action}</p>
  </div>`;
}

function row(shown: StatusRow): Html {
  return html`<li class="row">
    <span class="row-label">${shown.label}</span
    ><span class="badge tone-${shown.tone}"
      >${ICONS[shown.tone]}${shown.word}</span
    ><span class="row-detail">${shown.detail}</span>
  </li>`;
}
