// The core's schema, in order (DS3): Azure SQL in mode H, the same schema in one SQLite file in
// mode A. A new migration goes at the end; a released one is never edited or removed.
import { ITERATION_001_SCHEMA } from "./0001-iteration-001-schema.ts";
import { CONNECTOR_ENROLLMENT_CODE } from "./0002-connector-enrollment-code.ts";
import { ONE_PENDING_ENROLLMENT } from "./0003-one-pending-enrollment.ts";
import { STATE_SOURCE } from "./0004-state-source.ts";
import { SNAPSHOT_ORDER } from "./0005-snapshot-order.ts";
import { MOTION_SINCE } from "./0006-motion-since.ts";
import { EVENT_LOG_AND_AUDIT } from "./0007-event-log-and-audit.ts";
import { WEBHOOK_SUBSCRIPTIONS } from "./0008-webhook-subscriptions.ts";
import { EVENT_CURSORS } from "./0009-event-cursors.ts";
import { RECOVERY_HEALTH } from "./0010-recovery-health.ts";
import { EVENT_MEDIA } from "./0011-event-media.ts";
import { MEDIA_HANDOFF } from "./0012-media-handoff.ts";
import { MEDIA_AUDIT_CONTEXT } from "./0013-media-audit-context.ts";
import { CAMERA_PERSON_EVENTS } from "./0014-camera-person-events.ts";
import type { Migration } from "./migration.ts";

export const CORE_MIGRATIONS: readonly Migration[] = [
  ITERATION_001_SCHEMA,
  CONNECTOR_ENROLLMENT_CODE,
  ONE_PENDING_ENROLLMENT,
  STATE_SOURCE,
  SNAPSHOT_ORDER,
  MOTION_SINCE,
  EVENT_LOG_AND_AUDIT,
  WEBHOOK_SUBSCRIPTIONS,
  EVENT_CURSORS,
  RECOVERY_HEALTH,
  EVENT_MEDIA,
  MEDIA_HANDOFF,
  MEDIA_AUDIT_CONTEXT,
  CAMERA_PERSON_EVENTS,
];
