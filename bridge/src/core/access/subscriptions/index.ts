// Subscriptions (CP-12/CP-13, T048): the MCP Events webhook subscriptions, sealed in the core's
// database, and the delivery key that seals them. Its only entry point (CD4). Delivery stores and
// reads them; the cursors per client and location come with T051.

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
