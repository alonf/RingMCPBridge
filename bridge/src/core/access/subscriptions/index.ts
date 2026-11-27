// Subscriptions (CP-12/CP-13, T048): the MCP Events webhook subscriptions, sealed in the core's
// database, and the delivery key that seals them. Its only entry point (CD4). Delivery stores and
// reads them; the clients' read marks per location are T051's.

/** The store, its error, and the DTOs it declares. */
export {
  subscriptionId,
  SubscriptionsError,
  SubscriptionsStore,
} from "./subscriptions-store.ts";
export type {
  NewSubscription,
  SubscriptionsErrorKind,
  SubscriptionsStoreOptions,
  WebhookSubscription,
} from "./subscriptions-store.ts";

/** The clients' read marks (T051). */
export { CursorStore } from "./cursor-store.ts";
export type { CursorStoreOptions, ReadMark } from "./cursor-store.ts";

/** The delivery key: read by the core, written once by the bootstrap. */
export {
  DELIVERY_KEY_NAME,
  DeliveryKeySource,
  writeFirstDeliveryKey,
} from "./delivery-key.ts";
export type {
  DeliveryKeyOptions,
  FirstDeliveryKeyOutcome,
} from "./delivery-key.ts";
