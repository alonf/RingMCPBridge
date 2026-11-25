import { html } from "hono/html";
import type { MediaHandoff } from "../../managers/media/index.ts";

export const MEDIA_SETTINGS = "/admin/cameras";
export const cameraSettingsUnavailable = () =>
  html`<section class="card">
    <h2>Camera permissions</h2>
    <p>Camera settings could not be loaded.</p>
  </section>`;
export type CameraAdmin = Pick<MediaHandoff, "options" | "camera" | "save">;
export async function cameraSettings(
  media: CameraAdmin,
  query: URLSearchParams,
  formToken: string,
  signal: AbortSignal,
) {
  const { locations, cameras, receivers, sharedPersonEventsAllowed } =
    await media.options(signal);
  const receiverLabels = new Map(
    receivers.map(({ client_id: id, platform }) => [
      id,
      platform && platform !== id ? `${platform} (${id})` : id,
    ]),
  );
  const home =
    locations.find((l) => l.location_id === query.get("location_id")) ??
    locations[0];
  const inHome = cameras.filter((c) => c.location_id === home?.location_id);
  const camera =
    inHome.find((c) => c.device_id === query.get("device_id")) ?? inHome[0];
  const policy =
    home &&
    camera &&
    (await media.camera(home.location_id, camera.device_id, signal));
  const blocksPerson =
    home?.ownership === "shared" && !sharedPersonEventsAllowed;
  return html`<section
    id="cameras"
    class="card"
    aria-labelledby="cameras-title"
  >
    <h2 id="cameras-title">Camera permissions</h2>
    <form action="/admin#cameras" method="get">
      <label
        >Household
        <select name="location_id">
          ${locations.map((l) => html`<option value="${l.location_id}" ${l === home ? "selected" : ""}>${l.name}</option>`)}
        </select></label
      ><button>Show household</button>
    </form>
    ${
      home && camera
        ? html`<form action="/admin#cameras" method="get">
            <input
              type="hidden"
              name="location_id"
              value="${home.location_id}"
            />
            <label
              >Camera
              <select name="device_id">
                ${inHome.map((c) => html`<option value="${c.device_id}" ${c === camera ? "selected" : ""}>${c.name}</option>`)}
              </select></label
            >
            <button>Show permissions</button>
          </form>`
        : html`<p>No cameras in this household.</p>`
    }
    ${
      home && camera && policy
        ? html`<form action="${MEDIA_SETTINGS}" method="post">
            <fieldset>
              <legend>${camera.name}</legend>
              <input type="hidden" name="camera_form" value="settings" />
              <input
                type="hidden"
                name="form_token"
                value="${formToken}"
              /><input
                type="hidden"
                name="location_id"
                value="${home.location_id}"
              />
              <input
                type="hidden"
                name="device_id"
                value="${camera.device_id}"
              />
              <label
                >Person-detection events
                <select name="person_action" ${blocksPerson ? "disabled" : ""}>
                  ${(
                    [
                      ["inherit", "Use deployment setting"],
                      ["push", "Push"],
                      ["store_only", "Store only"],
                      ["drop", "Drop"],
                    ] as const
                  ).map(
                    ([v, label]) =>
                      html`<option
                        value="${v}"
                        ${(blocksPerson ? "drop" : (policy.personAction ?? "inherit")) === v ? "selected" : ""}
                      >
                        ${label}
                      </option>`,
                  )}
                </select>
              </label>
              <p>
                ${blocksPerson ? "The deployment policy drops person detections from shared households." : "Applies to detections forwarded by the home connector."}
              </p>
              <label
                ><input
                  type="checkbox"
                  name="enabled"
                  ${policy.enabled ? "checked" : ""}
                />
                Allow agent media access to this camera</label
              >
              <label
                ><input
                  type="checkbox"
                  name="sound"
                  ${policy.sound ? "checked" : ""}
                />
                Include recorded sound in clips</label
              >
              <fieldset>
                <legend>Services allowed to receive photos and clips</legend>
                ${Array.from(policy.approvals.keys(), (id) => {
                  const name = receiverLabels.get(id) ?? id;
                  return html`<label
                    ><input
                      type="checkbox"
                      name="remove[]"
                      value="${id}"
                    />Remove approval from ${name}</label
                  >`;
                })}
                ${policy.approvals.size === 0 ? html`<p>No services approved.</p>` : ""}
                <label
                  >Add receiving service
                  <select name="receiver_id">
                    <option value="">Select a service</option>
                    ${Array.from(receiverLabels)
                      .filter(([id]) => !policy.approvals.has(id))
                      .map(
                        ([id, label]) =>
                          html`<option value="${id}">${label}</option>`,
                      )}
                  </select>
                </label>
              </fieldset>
              <button type="submit">Save camera permissions</button>
              <button type="reset">Cancel</button>
            </fieldset>
          </form>`
        : ""
    }
  </section>`;
}
