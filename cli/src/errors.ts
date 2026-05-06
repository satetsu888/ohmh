// Common CLI error types. Process exit codes are defined here as well.

export const EXIT_OK = 0;
export const EXIT_GENERAL_ERROR = 1;
export const EXIT_AUTH_ERROR = 2;
export const EXIT_PLAN_LIMIT = 3;
export const EXIT_NOT_FOUND = 4;
export const EXIT_BAD_INPUT = 5;

// Stable string identifiers for the JSON error event. AI agents and scripts
// branch on `code` rather than the human-readable message.
export type ErrorCode =
  | "general_error"
  | "auth_required"
  | "state_mismatch"
  | "plan_limit"
  | "plan_limit_upgradable"
  | "plan_limit_top"
  | "not_found"
  | "bad_input"
  | "ephemeral_via_ws_only"
  | "forward_failed";

export class CliError extends Error {
  readonly exitCode: number;
  readonly code: ErrorCode;

  constructor(
    message: string,
    exitCode: number = EXIT_GENERAL_ERROR,
    code: ErrorCode = "general_error",
  ) {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
  }
}

export class AuthRequiredError extends CliError {
  constructor(message: string = 'not authenticated. Please run "ohmh login" first.') {
    super(message, EXIT_AUTH_ERROR, "auth_required");
  }
}

export class HttpError extends CliError {
  readonly status: number;
  readonly body: unknown;

  constructor(
    message: string,
    status: number,
    body: unknown,
    exitCode: number = EXIT_GENERAL_ERROR,
    code: ErrorCode = "general_error",
  ) {
    super(message, exitCode, code);
    this.status = status;
    this.body = body;
  }
}
