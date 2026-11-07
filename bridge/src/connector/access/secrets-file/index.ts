// Secrets File (CP-06, T012): the connector's sealed file of Ring and connector secrets at home.
// Its only entry point (CD4). Its values are never logged and never sent on the link (FR-034).

/** The file: open, create for the Setup CLI, and update on a token rotation. */
export { SecretsFile } from "./secrets-file.ts";
export type {
  HomeSecrets,
  HomeSecretsChange,
  PushCredentials,
  SecretsFileLocation,
} from "./secrets-file.ts";

/** The key's Docker secret: base64url text, read at start and written by the Setup CLI. */
export {
  encodeSecretsFileKey,
  readSecretsFileKey,
} from "./secrets-file-key.ts";

/** The component's error, with a closed `kind` (see `SecretsFileErrorKind`). */
export { SecretsFileError } from "./secrets-file-error.ts";
export type { SecretsFileErrorKind } from "./secrets-file-error.ts";
