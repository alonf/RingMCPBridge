// Web (T029): the admin page, served by the core in mode H. Its only entry point (CD4). The Host
// serves its paths and hands it the sign-in return the Issuer does not own.

/** The admin page, its settings and what it is wired with. */
export {
  ADMIN_PATH,
  ADMIN_PATHS,
  FRESH_SIGN_IN_MS,
  SIGN_IN_RETURN_PATH,
  Web,
} from "./web.ts";
export type { WebDependencies, WebSettings } from "./web.ts";

/** The themes' colours, for the contrast check. */
export { THEME_TOKENS } from "./styles.ts";
export type { Theme, ThemeTokens } from "./styles.ts";

/** How often the open page polls the Health section. */
export { HEALTH_POLL_MS } from "./page-script.ts";

/** How long a session lasts. */
export { SESSION_IDLE_MS, SESSION_MAX_MS } from "./owner-sessions.ts";
