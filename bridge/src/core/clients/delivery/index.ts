// Delivery (CP-13, T048): events to ChatGPT as MCP Events webhooks, the subscriptions behind them,
// and the bounded fetch every callback goes through. Its only entry point (CD4). The Host wires it
// to the MCP Endpoint (subscribe, unsubscribe, the event types) and to the Event manager's
// `event.stored`.

/** Delivery, its DTOs and its error. */
export {
  clientRef,
  Delivery,
  DeliveryError,
  EVENT_TYPE,
  MAX_WEBHOOK_BYTES,
  MIN_SUBSCRIPTION_TTL_MS,
  RETRY_DELAYS_MS,
  SUBSCRIPTION_TTL_MS,
} from "./delivery.ts";
export type {
  DeliveryErrorKind,
  DeliveryOptions,
  DeviceLabel,
  EventTypeDescription,
  StoredEventMessage,
  SubscribeAnswer,
  SubscribeRequest,
} from "./delivery.ts";

/** The bounded fetch for callbacks: allowed hosts, public addresses, limits, no redirects. */
export {
  CallbackError,
  httpsCallbackTransport,
  isPublicAddress,
} from "./callback-transport.ts";
export type {
  CallbackErrorKind,
  CallbackRequest,
  CallbackResponse,
  CallbackTransport,
  CallbackTransportOptions,
} from "./callback-transport.ts";

/** Standard Webhooks signing with a client's `whsec_` secret. */
export { signedHeaders, signingKeyOf } from "./webhook-signature.ts";
