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
  const { locations, cameras, receivers } = await media.options(signal);
  const home =
    locations.find((l) => l.location_id === query.get("location_id")) ??
    locations[0];
  const inHome = cameras.filter((c) => c.location_id === home?.location_id);
  const camera =
    inHome.find((c) => c.device_id === query.get("device_id")) ?? inHome[0];
  const receiver =
    receivers.find((r) => r.client_id === query.get("receiver_id")) ??
    receivers[0];
  const policy =
    home &&
    camera &&
    (await media.camera(home.location_id, camera.device_id, signal));
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
            <label
              >Receiving service
              <select name="receiver_id">
                ${receivers.map((r) => html`<option value="${r.client_id}" ${r === receiver ? "selected" : ""}>${r.platform ?? r.client_id}</option>`)}
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
              <legend>
                ${camera.name}${receiver ? " · " + (receiver.platform ?? receiver.client_id) : ""}
              </legend>
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
              /><input
                type="hidden"
                name="receiver_id"
                value="${receiver?.client_id ?? ""}"
              />
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
              ${
                receiver
                  ? html`<label
                      ><input
                        type="checkbox"
                        name="approved"
                        ${policy.approvals.has(receiver.client_id) ? "checked" : ""}
                      />
                      Approve this service for photos and clips</label
                    >`
                  : html`<p>No receiving service is registered for media.</p>`
              }
              <button type="submit">Save camera permissions</button>
            </fieldset>
          </form>`
        : !receiver
          ? html`<p>No receiving service is registered for media.</p>`
          : ""
    }
  </section>`;
}
