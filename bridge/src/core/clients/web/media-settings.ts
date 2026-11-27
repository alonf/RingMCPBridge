import { createHash } from "node:crypto";
import { html } from "hono/html";
import {
  effectiveReceiverAccess,
  type MediaHandoff,
} from "../../managers/media/index.ts";

export const MEDIA_SETTINGS = "/admin/cameras";
export const cameraSettingsUnavailable = () =>
  html`<section id="cameras" class="card">
    <h2>Camera permissions</h2>
    <p>Camera settings could not be loaded.</p>
  </section>`;
export type CameraAdmin = Pick<MediaHandoff, "options" | "camera" | "save">;

const personActions = [
  ["inherit", "Use default"],
  ["push", "Push"],
  ["store_only", "Store only"],
  ["drop", "Drop"],
] as const;

export function cameraAnchor(home: string, device: string) {
  const key = createHash("sha256").update(JSON.stringify([home, device]));
  return "camera-" + key.digest("hex").slice(0, 16);
}

export async function cameraSettings(
  media: CameraAdmin,
  formToken: string,
  signal: AbortSignal,
) {
  const { locations, cameras, agents, denials, sharedPersonEventsAllowed } =
    await media.options(signal);
  const agentsById = new Map(agents.map((agent) => [agent.client_id, agent]));
  const policies = await Promise.all(
    cameras.map(
      async (camera) =>
        [
          camera.device_id,
          await media.camera(camera.location_id, camera.device_id, signal),
        ] as const,
    ),
  );
  const byCamera = new Map(policies);
  return html`<section
    id="cameras"
    class="card"
    aria-labelledby="cameras-title"
  >
    <h2 id="cameras-title">Camera permissions</h2>
    <p class="as-of">
      Manage event notifications, recorded media and receiving services for each
      camera. Save each camera independently.
    </p>
    ${locations.length === 0 ? html`<p>No households are available.</p>` : ""}
    ${locations.map((home) => {
      const devices = cameras
        .filter((camera) => camera.location_id === home.location_id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const blocksPerson =
        home.ownership === "shared" && !sharedPersonEventsAllowed;
      return html`<section class="camera-household">
        <header class="card-head">
          <h3>${home.name}</h3>
          <span class="as-of"
            >${home.ownership === "shared" ? "Shared household" : "Owned household"}
            · ${devices.length}
            ${devices.length === 1 ? "camera" : "cameras"}</span
          >
        </header>
        ${devices.length === 0 ? html`<p>No cameras in this household.</p>` : ""}
        <div class="camera-grid">
          ${devices.map((camera) => {
            const policy = byCamera.get(camera.device_id);
            if (!policy) return "";
            const anchor = cameraAnchor(home.location_id, camera.device_id);
            const ids = new Set([
              ...agents.map((agent) => agent.client_id),
              ...policy.approvals.keys(),
            ]);
            return html`<form
              class="camera-panel"
              id="${anchor}"
              aria-labelledby="${anchor}-name"
              action="${MEDIA_SETTINGS}"
              method="post"
            >
              <h4 id="${anchor}-name">${camera.name}</h4>
              <input type="hidden" name="camera_form" value="matrix" />
              <input
                type="hidden"
                name="expected_generation"
                value="${policy.generation}"
              />
              <input
                type="hidden"
                name="expected_approval_revision"
                value="${policy.approvalRevision}"
              />
              <input
                type="hidden"
                name="expected_person_action"
                value="${policy.personAction ?? "inherit"}"
              />
              <input type="hidden" name="form_token" value="${formToken}" />
              <input
                type="hidden"
                name="location_id"
                value="${home.location_id}"
              />
              <input
                type="hidden"
                name="device_id"
                value="${camera.device_id}"
              />
              <fieldset>
                <legend>Person detection</legend>
                ${
                  blocksPerson
                    ? html`<p>
                        Blocked by the deployment policy for shared households.
                      </p>`
                    : html`<div class="camera-actions">
                        ${personActions.map(([value, label]) => html`<label><input type="radio" name="person_action" value="${value}" ${(policy.personAction ?? "inherit") === value ? "checked" : ""} />${label}</label>`)}
                      </div>`
                }
              </fieldset>
              <fieldset>
                <legend>Recorded media</legend>
                <label
                  ><input
                    type="checkbox"
                    name="enabled"
                    ${policy.enabled ? "checked" : ""}
                  />
                  Allow media access</label
                >
                <label
                  ><input
                    type="checkbox"
                    name="sound"
                    ${policy.sound ? "checked" : ""}
                  />
                  Include sound in clips</label
                >
              </fieldset>
              <fieldset>
                <legend>Receiving services</legend>
                ${ids.size === 0 ? html`<p>No receiving services are registered.</p>` : ""}
                ${Array.from(ids, (id) => {
                  const agent = agentsById.get(id);
                  const name = agent?.platform ?? id;
                  const checked = policy.approvals.has(id);
                  const reason = effectiveReceiverAccess(
                    agent,
                    policy.enabled,
                    checked,
                  );
                  const canSelect =
                    checked ||
                    effectiveReceiverAccess(agent, true, true) === undefined;
                  return html`<div class="camera-receiver">
                    <label
                      ><input
                        type="checkbox"
                        name="receiver[]"
                        value="${id}"
                        ${checked ? "checked" : ""}
                        ${canSelect ? "" : "disabled"}
                      />
                      ${name}</label
                    >
                    ${name !== id ? html`<small>${id}</small>` : ""}
                    <small class="${reason ? "as-of" : "tone-ok"}"
                      >${reason ? "Blocked · " + reason : "Allowed · Photos and clips"}</small
                    >
                  </div>`;
                })}
              </fieldset>
              <div class="camera-actions">
                <button type="submit">Save permissions</button
                ><button type="reset">Reset edits</button>
              </div>
            </form>`;
          })}
        </div>
      </section>`;
    })}
    <details class="camera-audit">
      <summary>Recent denied media handoffs</summary>
      <p>Latest 20 across all households. Times are UTC.</p>
      <ul>
        ${denials.map((d) => html`<li>${new Date(Number(d.ts)).toISOString()} · ${d.requester_id} → ${d.receiver_id} · household ${d.location_id} · camera ${d.device_id} · event ${d.event_id} · ${d.denial_reason ?? "Reason was not recorded"}</li>`)}
      </ul>
    </details>
  </section>`;
}
