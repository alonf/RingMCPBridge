// Web (T029; FR-005, FR-032, FR-040; SC2; UX U1-U5): the minimal admin page in mode H, for the owner
// only, behind a fresh Entra sign-in. It calls Admin and Inquiry, never the tables (DS6).
// - **Sign-in**: every session starts with a fresh sign-in (`prompt=login`), bound to the browser
//   that started it as the Issuer's are (DRIFT-001-40). Entra returns to the core's one return
//   route, which the Host hands to Web when the Issuer does not own the sign-in.
// - **Forms**: each carries its session's token, and each must come from the core's own origin. The
//   cookies are `SameSite=Lax`, since the return from Entra is a navigation from another site.
// - **Approving a connector** needs a sign-in under 5 minutes old, checked when the form arrives,
//   and the request's code typed again, compared without dashes, spaces or case [P]. It approves the
//   key the page showed: if a newer request replaced it, nothing is approved. A core instance
//   without the lease approves nothing.
// - **The home's time zone** (DRIFT-001-81): the owner chooses it from the zones Intl knows, checked
//   again when the form arrives. It is saved for the home's first owned location, found again then,
//   never taken from the form. It is not a risky action: a session and its form token are enough.
// - **The page's policy**: no inline script or style, no framing, nothing cached, no referrer.
// - **Failures** become page states, in words the bridge wrote: the store down is a banner, never an
//   error page. Each is logged once, here.
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Context } from "hono";
import { z } from "zod";
import { isValidTimeZone } from "../../../utilities/clock/index.ts";
import type { Clock } from "../../../utilities/clock/index.ts";
import type { Logger } from "../../../utilities/logging/index.ts";
import { QueryLayerError } from "../../../utilities/query-layer/index.ts";
import { SecurityError } from "../../../utilities/security/index.ts";
import type {
  OwnerIdentity,
  OwnerSignIn,
  SignInRedirect,
} from "../../../utilities/security/index.ts";
import { AdminError } from "../../managers/admin/index.ts";
import type { AdminManager } from "../../managers/admin/index.ts";
import { InquiryError } from "../../managers/inquiry/index.ts";
import type {
  InquiryManager,
  OwnerHealth,
} from "../../managers/inquiry/index.ts";
import { AdminSignIns } from "./admin-sign-ins.ts";
import {
  cameraSettings,
  cameraSettingsUnavailable,
  MEDIA_SETTINGS,
  type CameraAdmin,
} from "./media-settings.ts";
import {
  MediaDenied,
  MediaSettingsUnavailable,
} from "../../managers/media/index.ts";
import type { Section } from "./admin-sign-ins.ts";
import {
  clearCookie,
  readCookie,
  sameText,
  setCookie,
  sha256,
} from "./cookies.ts";
import { healthPanel, timeIn, UNREADABLE_PANEL } from "./health-panel.ts";
import type { HealthPanel } from "./health-panel.ts";
import { OwnerSessions } from "./owner-sessions.ts";
import type { Notice, OwnerSession } from "./owner-sessions.ts";
import { pageScript } from "./page-script.ts";
import {
  adminPage,
  CONFIRMATION_MAX_LENGTH,
  MEDIA_DELETE_CONFIRMATION,
  healthSection,
  refusedPage,
  signedOutHealth,
  signInPage,
} from "./pages.ts";
import type {
  EnrollPanel,
  PagePaths,
  SignInProblem,
  TimeZonePanel,
} from "./pages.ts";
import { STYLESHEET } from "./styles.ts";
import type { Theme } from "./styles.ts";

/** The admin page's base path [P]. */
export const ADMIN_PATH = "/admin";
/** Where Entra sends the owner back after signing in: the Issuer's sign-ins and the admin page's. */
export const SIGN_IN_RETURN_PATH = "/sign-in/return";
/** The admin page's paths [P]. */
export const ADMIN_PATHS: PagePaths = {
  page: ADMIN_PATH,
  signIn: `${ADMIN_PATH}/sign-in`,
  signOut: `${ADMIN_PATH}/sign-out`,
  approve: `${ADMIN_PATH}/enroll/approve`,
  timeZone: `${ADMIN_PATH}/time-zone`,
  theme: `${ADMIN_PATH}/theme`,
  stylesheet: `${ADMIN_PATH}/app.css`,
  script: `${ADMIN_PATH}/app.js`,
};
const DELETE_MEDIA = "/admin/media/delete";
const HEALTH_PATH = `${ADMIN_PATH}/health`;

const MINUTE_MS = 60_000;
/** How recent a sign-in must be to approve a connector (UX U4). */
export const FRESH_SIGN_IN_MS = 5 * MINUTE_MS;
/** How long a sign-in step or a manager's read may take [P]. */
const SIGN_IN_TIMEOUT_MS = 10_000;
const MANAGER_TIMEOUT_MS = 10_000;

const SESSION_COOKIE = "admin_session";
const SIGN_IN_COOKIE = "admin_sign_in";
const SIGN_IN_COOKIE_MAX_AGE_S = 600;
const THEME_COOKIE = "admin_theme";
const THEME_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;
const BINDING_BYTES = 32;
const KEY_ID_MAX_LENGTH = 64;
const FORM_TOKEN_MAX_LENGTH = 64;
/** The longest time zone taken: the State store's limit. */
const TIME_ZONE_MAX_LENGTH = 64;
/** The zones the owner may choose: every IANA zone this runtime's Intl knows. */
const TIME_ZONE_CHOICES: readonly string[] = Intl.supportedValuesOf("timeZone");
/** The largest form body taken [P]: the forms hold a few short fields. */
const FORM_BODY_LIMIT_BYTES = 4 * 1024;

const HTTP_SEE_OTHER = 303;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_SERVER_ERROR = 500;

const POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": POLICY,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  // Not `no-referrer`: with it, browsers send `Origin: null` on the page's own form posts, and
  // every form would fail the Origin check. `same-origin` still sends nothing to other sites.
  "referrer-policy": "same-origin",
  "cross-origin-opener-policy": "same-origin",
  "cache-control": "no-store",
};

const APPROVE_FORM = z.object({
  form_token: z.string().min(1).max(FORM_TOKEN_MAX_LENGTH),
  key_id: z.string().min(1).max(KEY_ID_MAX_LENGTH),
  confirmation: z.string().max(CONFIRMATION_MAX_LENGTH),
});
const SESSION_FORM = z.object({
  form_token: z.string().min(1).max(FORM_TOKEN_MAX_LENGTH),
});
const TIME_ZONE_FORM = z.object({
  form_token: z.string().min(1).max(FORM_TOKEN_MAX_LENGTH),
  time_zone: z.string().min(1).max(TIME_ZONE_MAX_LENGTH),
});
const THEME_FORM = z.object({ theme: z.enum(["dark", "light"]) });
const SIGN_IN_PROBLEMS: ReadonlySet<string> = new Set<SignInProblem>([
  "refused",
  "not_owner",
  "unavailable",
  "invalid",
  "expired",
  "other_browser",
  "signed_out",
]);

/** Where Web is served. */
export interface WebSettings {
  /** The core's public URL: every form must come from its origin. */
  readonly publicUrl: string;
  /** The core's own version, to tell when the connector is behind. */
  readonly coreVersion: string;
}

/** What Web is wired with. */
export interface WebDependencies {
  readonly admin: Pick<
    AdminManager,
    "pendingEnrollment" | "approveEnrollment" | "setLocationTimeZone"
  > &
    Partial<Pick<AdminManager, "deleteCachedMedia">>;
  readonly inquiry: Pick<InquiryManager, "getOwnerHealth">;
  readonly ownerSignIn: OwnerSignIn;
  readonly media?: CameraAdmin;
  /** Whether this core instance holds the lease: without it, nothing is approved. */
  readonly serving: () => boolean;
  readonly clock: Clock;
  readonly logger: Logger;
}

type WebContext = Context;

/** The admin page. One per core process, in mode H. */
export class Web {
  readonly #settings: WebSettings;
  readonly #dependencies: WebDependencies;
  readonly #logger: Logger;
  readonly #origin: string;
  readonly #sessions: OwnerSessions;
  readonly #signIns: AdminSignIns;
  readonly #app = new Hono();
  readonly #script: string;

  constructor(settings: WebSettings, dependencies: WebDependencies) {
    this.#settings = settings;
    this.#dependencies = dependencies;
    this.#logger = dependencies.logger.with({ component: "web" });
    this.#origin = new URL(settings.publicUrl).origin;
    this.#sessions = new OwnerSessions(dependencies.clock);
    this.#signIns = new AdminSignIns(dependencies.clock);
    this.#script = pageScript({
      healthPath: HEALTH_PATH,
      themeCookie: THEME_COOKIE,
      themeCookiePath: ADMIN_PATH,
      themeCookieMaxAgeS: THEME_COOKIE_MAX_AGE_S,
    });
    this.#routes();
  }

  /** Answers a request for the admin page's paths, or the sign-in return the Issuer did not own. */
  async fetch(request: Request): Promise<Response> {
    return this.#app.fetch(request);
  }

  #routes(): void {
    const app = this.#app;
    app.use("*", async (context, next) => {
      await next();
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        context.res.headers.set(name, value);
      }
    });
    app.get(ADMIN_PATH, (context) => this.#page(context));
    app.get(ADMIN_PATHS.signIn, (context) => this.#startSignIn(context));
    app.get(SIGN_IN_RETURN_PATH, (context) => this.#finishSignIn(context));
    app.get(HEALTH_PATH, (context) => this.#health(context));
    for (const path of [
      ADMIN_PATHS.approve,
      ADMIN_PATHS.timeZone,
      ADMIN_PATHS.signOut,
      ADMIN_PATHS.theme,
      MEDIA_SETTINGS,
      DELETE_MEDIA,
    ]) {
      app.use(
        path,
        bodyLimit({
          maxSize: FORM_BODY_LIMIT_BYTES,
          onError: (context) =>
            this.#refuse(context, "This form is too large.", {
              status: HTTP_PAYLOAD_TOO_LARGE,
              reason: "too_large",
            }),
        }),
      );
    }
    app.post(DELETE_MEDIA, (context) => this.#deleteMedia(context));
    app.post(MEDIA_SETTINGS, (context) => this.#cameraChange(context));
    app.post(ADMIN_PATHS.approve, (context) => this.#approve(context));
    app.post(ADMIN_PATHS.timeZone, (context) => this.#setTimeZone(context));
    app.post(ADMIN_PATHS.signOut, (context) => this.#signOut(context));
    app.post(ADMIN_PATHS.theme, (context) => this.#theme(context));
    app.get(ADMIN_PATHS.stylesheet, (context) =>
      context.body(STYLESHEET, 200, {
        "content-type": "text/css; charset=utf-8",
      }),
    );
    app.get(ADMIN_PATHS.script, (context) =>
      context.body(this.#script, 200, {
        "content-type": "text/javascript; charset=utf-8",
      }),
    );
    app.notFound((context) => context.text("Not found.", HTTP_NOT_FOUND));
    app.onError((error, context) => {
      this.#logger.error(
        "web_request_failed",
        { error_code: "internal" },
        error,
      );
      return context.html(
        refusedPage({
          paths: ADMIN_PATHS,
          theme: themeOf(context),
          text: "Something went wrong on the bridge. Reload the page.",
        }),
        HTTP_SERVER_ERROR,
      );
    });
  }

  async #deleteMedia(context: WebContext) {
    const checked = await this.#sessionForm(
      context,
      SESSION_FORM.extend({ confirm: z.string().optional() }),
    );
    if (checked instanceof Response) return checked;
    if (!this.#fresh(checked.session))
      return context.redirect(ADMIN_PATH + "#media-storage", HTTP_SEE_OTHER);
    if (checked.form.confirm !== MEDIA_DELETE_CONFIRMATION)
      return this.#refuse(
        context,
        `Type ${MEDIA_DELETE_CONFIRMATION} to confirm deletion of cached media.`,
      );
    const { admin, serving, media } = this.#dependencies;
    if (!media || !admin.deleteCachedMedia || !serving())
      return context.text("Media storage unavailable.", 503);
    let kind: Notice["kind"] = "media_deleted";
    try {
      await admin.deleteCachedMedia(AbortSignal.timeout(60_000));
    } catch (error) {
      if (!(error instanceof AdminError || isTimeout(error))) throw error;
      this.#logger.error("web_media_delete_incomplete", {}, error);
      kind =
        error instanceof AdminError && error.kind === "cleanup_pending"
          ? "media_cleanup_pending"
          : "media_delete_unknown";
    }
    this.#sessions.tell(checked.session.id, { kind });
    return context.redirect(ADMIN_PATH + "#media-storage", HTTP_SEE_OTHER);
  }
  async #cameraChange(context: WebContext): Promise<Response> {
    const checked = await this.#sessionForm(
      context,
      SESSION_FORM.extend({
        location_id: z.string().min(1).max(256),
        device_id: z.string().min(1).max(256),
        receiver_id: z.string().max(400),
        enabled: z.literal("on").optional(),
        sound: z.literal("on").optional(),
        approved: z.literal("on").optional(),
        camera_form: z.literal("settings").optional(),
        "remove[]": z.array(z.string().min(1).max(400)).optional(),
        person_action: z
          .enum(["inherit", "push", "store_only", "drop"])
          .optional(),
      }),
    );
    if (checked instanceof Response) return checked;
    const media = this.#dependencies.media;
    if (!media || !this.#dependencies.serving())
      return context.text("Camera settings unavailable.", 503);
    const { location_id, device_id, receiver_id, enabled, sound, approved } =
      checked.form;
    try {
      await media.save(
        location_id,
        device_id,
        receiver_id,
        {
          enabled: !!enabled,
          sound: !!sound,
          approved:
            checked.form.camera_form || checked.form.person_action
              ? !!receiver_id
              : !!approved,
          ...(checked.form["remove[]"] && { remove: checked.form["remove[]"] }),
          ...(checked.form.person_action && {
            personAction: checked.form.person_action,
          }),
        },
        AbortSignal.timeout(MANAGER_TIMEOUT_MS),
      );
    } catch (error) {
      if (error instanceof MediaDenied)
        return context.text(
          error.message || "Unknown camera or receiving service.",
          400,
        );
      if (!(
        error instanceof MediaSettingsUnavailable ||
        error instanceof QueryLayerError ||
        isTimeout(error)
      ))
        throw error;
      this.#logger.error(
        "web_camera_save_failed",
        { device_id, location_id },
        error,
      );
      this.#sessions.tell(checked.session.id, {
        kind:
          error instanceof MediaSettingsUnavailable
            ? "media_save_unavailable"
            : "media_save_unknown",
      });
    }
    const selected = new URLSearchParams({
      location_id,
      device_id,
      receiver_id,
    });
    return context.redirect(
      ADMIN_PATH + "?" + selected.toString() + "#cameras",
      HTTP_SEE_OTHER,
    );
  }
  async #page(context: WebContext): Promise<Response> {
    const theme = themeOf(context);
    const session = this.#session(context);
    if (session === undefined) {
      const problem = context.req.query("problem");
      return context.html(
        signInPage({
          paths: ADMIN_PATHS,
          theme,
          problem:
            problem !== undefined && SIGN_IN_PROBLEMS.has(problem)
              ? (problem as SignInProblem)
              : undefined,
        }),
      );
    }
    const { panel, timeZone, zonePanel } = await this.#readHealth();
    const enroll = await this.#readEnrollment(session, timeZone);
    return context.html(
      adminPage({
        paths: ADMIN_PATHS,
        theme,
        formToken: session.formToken,
        health: panel,
        enroll,
        timeZone: zonePanel,
        ...(this.#dependencies.media && {
          cameras: await cameraSettings(
            this.#dependencies.media,
            new URL(context.req.url).searchParams,
            session.formToken,
            AbortSignal.timeout(MANAGER_TIMEOUT_MS),
          ).catch(() => {
            this.#logger.warn("camera_settings_unavailable");
            return cameraSettingsUnavailable();
          }),
        }),
        ...(this.#dependencies.media &&
          this.#dependencies.admin.deleteCachedMedia && {
            mediaDelete: { action: DELETE_MEDIA, fresh: this.#fresh(session) },
          }),
        notice: this.#sessions.takeNotice(session.id),
      }),
    );
  }

  async #health(context: WebContext): Promise<Response> {
    if (this.#session(context) === undefined) {
      return context.html(signedOutHealth(ADMIN_PATHS), HTTP_UNAUTHORIZED);
    }
    const { panel } = await this.#readHealth();
    return context.html(healthSection(panel, ADMIN_PATHS));
  }

  async #startSignIn(context: WebContext): Promise<Response> {
    const section = context.req.query("then");
    const then: Section =
      section === "enroll" || section === "media-storage" ? section : "health";
    let redirect: SignInRedirect;
    try {
      redirect = await this.#dependencies.ownerSignIn.begin(
        { fresh: true },
        AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
      );
    } catch (error) {
      if (!(error instanceof SecurityError || isTimeout(error))) {
        throw error;
      }
      this.#logger.warn("web_sign_in_not_started", {
        error_code: "unavailable",
      });
      return toSignInPage(context, "unavailable");
    }
    const binding = randomBytes(BINDING_BYTES).toString("base64url");
    this.#signIns.add({
      pending: redirect.pending,
      binding: sha256(binding),
      then,
    });
    context.header(
      "set-cookie",
      setCookie(SIGN_IN_COOKIE, binding, {
        path: SIGN_IN_RETURN_PATH,
        maxAgeS: SIGN_IN_COOKIE_MAX_AGE_S,
        httpOnly: true,
      }),
    );
    return context.redirect(redirect.url, HTTP_SEE_OTHER);
  }

  // The binding is checked before Entra's code is redeemed: a return in another browser redeems
  // nothing (DRIFT-001-40).
  async #finishSignIn(context: WebContext): Promise<Response> {
    const query = new URL(context.req.url).searchParams;
    const state = query.get("state");
    const signIn = state === null ? undefined : this.#signIns.take(state);
    context.header(
      "set-cookie",
      clearCookie(SIGN_IN_COOKIE, SIGN_IN_RETURN_PATH),
      {
        append: true,
      },
    );
    if (signIn === undefined) {
      return toSignInPage(context, "expired");
    }
    const presented = readCookie(context.req.header("cookie"), SIGN_IN_COOKIE);
    if (
      presented === undefined ||
      !sameText(sha256(presented), signIn.binding)
    ) {
      this.#logger.warn("web_sign_in_refused", { error_code: "other_browser" });
      return toSignInPage(context, "other_browser");
    }
    let owner: OwnerIdentity;
    try {
      owner = await this.#dependencies.ownerSignIn.complete(
        signIn.pending,
        query,
        AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
      );
    } catch (error) {
      if (!(error instanceof SecurityError)) {
        throw error;
      }
      const problem = signInProblem(error);
      this.#logger.warn("web_sign_in_refused", { error_code: problem });
      return toSignInPage(context, problem);
    }
    const session = this.#sessions.open(owner.authenticatedAt);
    this.#logger.info("web_owner_signed_in");
    context.header(
      "set-cookie",
      setCookie(SESSION_COOKIE, session.id, {
        path: ADMIN_PATH,
        httpOnly: true,
      }),
      { append: true },
    );
    return context.redirect(`${ADMIN_PATH}#${signIn.then}`, HTTP_SEE_OTHER);
  }

  async #approve(context: WebContext): Promise<Response> {
    const session = await this.#sessionForm(context, APPROVE_FORM);
    if (session instanceof Response) {
      return session;
    }
    const notice = await this.#approval(session.session, session.form);
    this.#sessions.tell(session.session.id, notice);
    return context.redirect(`${ADMIN_PATH}#enroll`, HTTP_SEE_OTHER);
  }

  // The checks run in this order: the sign-in's age, the lease, the request shown, the code typed.
  async #approval(
    session: OwnerSession,
    form: z.infer<typeof APPROVE_FORM>,
  ): Promise<Notice> {
    if (!this.#fresh(session)) {
      return { kind: "sign_in_stale" };
    }
    if (!this.#dependencies.serving()) {
      return { kind: "not_serving" };
    }
    return (await this.#checkRequest(form)) ?? this.#approveShown(form.key_id);
  }

  // Nothing is approved yet: a failure here changes nothing. `undefined` when the key may be approved.
  async #checkRequest(
    form: z.infer<typeof APPROVE_FORM>,
  ): Promise<Notice | undefined> {
    try {
      const pending = await this.#dependencies.admin.pendingEnrollment(
        AbortSignal.timeout(MANAGER_TIMEOUT_MS),
      );
      if (pending?.key_id !== form.key_id) {
        return { kind: "not_pending" };
      }
      return comparable(form.confirmation) ===
        comparable(pending.enrollment_code)
        ? undefined
        : { kind: "code_mismatch" };
    } catch (error) {
      return this.#notApproved(error, "unavailable");
    }
  }

  // A failure while approving may come after the change was made: its outcome is unknown.
  async #approveShown(keyId: string): Promise<Notice> {
    try {
      const approval = await this.#dependencies.admin.approveEnrollment(
        keyId,
        AbortSignal.timeout(MANAGER_TIMEOUT_MS),
      );
      if (approval.kind === "not_pending") {
        return { kind: "not_pending" };
      }
      this.#logger.info("web_connector_approved", {
        key_id: keyId,
        count: approval.revokedKeyIds.length,
      });
      return { kind: "approved", revoked: approval.revokedKeyIds.length };
    } catch (error) {
      return this.#notApproved(error, "outcome_unknown");
    }
  }

  #notApproved(
    error: unknown,
    notice: "unavailable" | "outcome_unknown",
  ): Notice {
    if (!(error instanceof AdminError || isTimeout(error))) {
      throw error;
    }
    this.#logger.warn("web_connector_not_approved", {
      error_code: error instanceof AdminError ? error.kind : "timeout",
      outcome: notice,
    });
    return { kind: notice };
  }

  async #setTimeZone(context: WebContext): Promise<Response> {
    const session = await this.#sessionForm(context, TIME_ZONE_FORM);
    if (session instanceof Response) {
      return session;
    }
    const notice = await this.#timeZoneChange(session.form.time_zone);
    this.#sessions.tell(session.session.id, notice);
    return context.redirect(`${ADMIN_PATH}#time-zone`, HTTP_SEE_OTHER);
  }

  // The zone is checked before anything is read or saved. The home is the one the page showed,
  // found again now.
  async #timeZoneChange(timeZone: string): Promise<Notice> {
    if (!isValidTimeZone(timeZone)) {
      return { kind: "time_zone_invalid" };
    }
    try {
      const { location_id: locationId } =
        await this.#dependencies.inquiry.getOwnerHealth(
          AbortSignal.timeout(MANAGER_TIMEOUT_MS),
        );
      if (locationId === undefined) {
        return { kind: "no_home" };
      }
      await this.#dependencies.admin.setLocationTimeZone(
        locationId,
        timeZone,
        AbortSignal.timeout(MANAGER_TIMEOUT_MS),
      );
      this.#logger.info("web_time_zone_set", { location_id: locationId });
      return { kind: "time_zone_saved", zone: timeZone };
    } catch (error) {
      return this.#timeZoneNotSaved(error);
    }
  }

  #timeZoneNotSaved(error: unknown): Notice {
    if (error instanceof RangeError) {
      return { kind: "time_zone_invalid" };
    }
    if (!(
      error instanceof InquiryError ||
      error instanceof AdminError ||
      isTimeout(error)
    )) {
      throw error;
    }
    this.#logger.warn("web_time_zone_not_set", {
      error_code:
        error instanceof InquiryError || error instanceof AdminError
          ? error.kind
          : "timeout",
    });
    return { kind: "time_zone_not_saved" };
  }

  async #signOut(context: WebContext): Promise<Response> {
    const session = await this.#sessionForm(context, SESSION_FORM);
    if (session instanceof Response) {
      return session;
    }
    this.#sessions.end(session.session.id);
    context.header("set-cookie", clearCookie(SESSION_COOKIE, ADMIN_PATH));
    return toSignInPage(context, "signed_out");
  }

  // The theme is a per-browser convenience, not the owner's data: it needs no session.
  async #theme(context: WebContext): Promise<Response> {
    if (!this.#fromThisSite(context)) {
      return this.#refuse(
        context,
        "This form did not come from the admin page.",
      );
    }
    const form = THEME_FORM.safeParse(await context.req.parseBody());
    if (form.success) {
      context.header(
        "set-cookie",
        setCookie(THEME_COOKIE, form.data.theme, {
          path: ADMIN_PATH,
          maxAgeS: THEME_COOKIE_MAX_AGE_S,
          httpOnly: false,
        }),
      );
    }
    return context.redirect(ADMIN_PATH, HTTP_SEE_OTHER);
  }

  // A form that changes something: from this site, by a signed-in owner, with the session's token.
  async #sessionForm<Form extends { readonly form_token: string }>(
    context: WebContext,
    schema: z.ZodType<Form>,
  ): Promise<Response | { session: OwnerSession; form: Form }> {
    if (!this.#fromThisSite(context)) {
      return this.#refuse(
        context,
        "This form did not come from the admin page.",
      );
    }
    const session = this.#session(context);
    if (session === undefined) {
      return toSignInPage(context, "expired");
    }
    const form = schema.safeParse(await context.req.parseBody());
    if (!form.success || !sameText(form.data.form_token, session.formToken)) {
      return this.#refuse(
        context,
        "This form is not from your current session. Open the admin page again.",
      );
    }
    return { session, form: form.data };
  }

  // A form the page does not take: from another site by default.
  #refuse(
    context: WebContext,
    text: string,
    why: {
      readonly status: typeof HTTP_FORBIDDEN | typeof HTTP_PAYLOAD_TOO_LARGE;
      readonly reason: string;
    } = { status: HTTP_FORBIDDEN, reason: "not_this_site" },
  ): Response | Promise<Response> {
    this.#logger.warn("web_form_refused", { error_code: why.reason });
    return context.html(
      refusedPage({ paths: ADMIN_PATHS, theme: themeOf(context), text }),
      why.status,
    );
  }

  #fromThisSite(context: WebContext): boolean {
    return context.req.header("origin") === this.#origin;
  }

  #session(context: WebContext): OwnerSession | undefined {
    return this.#sessions.use(
      readCookie(context.req.header("cookie"), SESSION_COOKIE),
    );
  }

  #fresh(session: OwnerSession): boolean {
    return (
      this.#dependencies.clock.now() - session.authenticatedAt <
      FRESH_SIGN_IN_MS
    );
  }

  // The store down is the panel's own state, never an error page.
  async #readHealth(): Promise<{
    panel: HealthPanel;
    timeZone: string;
    zonePanel: TimeZonePanel;
  }> {
    try {
      const read = await this.#dependencies.inquiry.getOwnerHealth(
        AbortSignal.timeout(MANAGER_TIMEOUT_MS),
      );
      return {
        panel: healthPanel(read, this.#settings.coreVersion),
        timeZone: read.time_zone,
        zonePanel: timeZonePanel(read),
      };
    } catch (error) {
      if (!(error instanceof InquiryError || isTimeout(error))) {
        throw error;
      }
      this.#logger.warn("web_health_not_read", {
        error_code: error instanceof InquiryError ? error.kind : "timeout",
      });
      return {
        panel: UNREADABLE_PANEL,
        timeZone: "UTC",
        zonePanel: { kind: "unavailable" },
      };
    }
  }

  async #readEnrollment(
    session: OwnerSession,
    timeZone: string,
  ): Promise<EnrollPanel> {
    try {
      const pending = await this.#dependencies.admin.pendingEnrollment(
        AbortSignal.timeout(MANAGER_TIMEOUT_MS),
      );
      if (pending === undefined) {
        return { kind: "none" };
      }
      return {
        kind: "waiting",
        keyId: pending.key_id,
        code: pending.enrollment_code,
        expiresAt: timeIn(timeZone)(pending.expires_at),
        fresh: this.#fresh(session),
      };
    } catch (error) {
      if (!(error instanceof AdminError || isTimeout(error))) {
        throw error;
      }
      this.#logger.warn("web_enrollment_not_read", {
        error_code: error instanceof AdminError ? error.kind : "timeout",
      });
      return { kind: "unavailable" };
    }
  }
}

// The zone in use is always among the choices, even one Intl names differently from its list.
function timeZonePanel(read: OwnerHealth): TimeZonePanel {
  if (read.location_id === undefined) {
    return { kind: "no_home" };
  }
  return {
    kind: "ready",
    zone: read.time_zone,
    source: read.time_zone_source,
    choices: TIME_ZONE_CHOICES.includes(read.time_zone)
      ? TIME_ZONE_CHOICES
      : [read.time_zone, ...TIME_ZONE_CHOICES],
  };
}

function themeOf(context: WebContext): Theme {
  return readCookie(context.req.header("cookie"), THEME_COOKIE) === "light"
    ? "light"
    : "dark";
}

function toSignInPage(context: WebContext, problem: SignInProblem): Response {
  return context.redirect(`${ADMIN_PATH}?problem=${problem}`, HTTP_SEE_OTHER);
}

// The sign-in's failures by what the owner reads; any other kind is a sign-in that could not be
// checked.
const PROBLEM_BY_KIND: Readonly<
  Partial<Record<SecurityError["kind"], SignInProblem>>
> = {
  sign_in_refused: "refused",
  sign_in_not_owner: "not_owner",
  sign_in_unavailable: "unavailable",
};

function signInProblem(error: SecurityError): SignInProblem {
  return PROBLEM_BY_KIND[error.kind] ?? "invalid";
}

// The code as typed and as kept, compared without dashes, spaces or case [P].
function comparable(code: string): string {
  return code.replaceAll(/[\s-]/g, "").toUpperCase();
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
