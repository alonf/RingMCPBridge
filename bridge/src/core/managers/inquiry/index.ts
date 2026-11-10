// Inquiry manager (CP-14, T021): the read tools, over State and Settings, with the Health and
// Summary engines. Its only entry point (CD4). MCP Endpoint calls it (T024).

/** The manager. */
export { InquiryManager } from "./inquiry-manager.ts";
export type { InquiryManagerOptions } from "./inquiry-manager.ts";

/** The requests, the reply around each tool's data, and the DTOs Inquiry declares. */
export type {
  DeviceDetail,
  DeviceList,
  DeviceListRequest,
  DeviceRequest,
  Freshness,
  Health,
  InquiryDeviceType,
  InquiryReply,
  Overview,
  OverviewRequest,
  OwnerHealth,
} from "./inquiry-manager.ts";

/** The error every use case throws: `invalid_argument`, `not_found`, `unavailable` or `failed`. */
export { InquiryError } from "./inquiry-error.ts";
export type {
  InquiryErrorDetails,
  InquiryErrorKind,
  InquiryErrorOptions,
} from "./inquiry-error.ts";
