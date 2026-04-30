// CLI 全体で扱う典型エラー。process exit code もここで定義する。

export const EXIT_OK = 0;
export const EXIT_GENERAL_ERROR = 1;
export const EXIT_AUTH_ERROR = 2;
export const EXIT_PLAN_LIMIT = 3;
export const EXIT_NOT_FOUND = 4;
export const EXIT_BAD_INPUT = 5;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_GENERAL_ERROR) {
    super(message);
    this.exitCode = exitCode;
  }
}

export class AuthRequiredError extends CliError {
  constructor(message: string = 'not authenticated. Please run "ohmh login" first.') {
    super(message, EXIT_AUTH_ERROR);
  }
}

export class HttpError extends CliError {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown, exitCode: number = EXIT_GENERAL_ERROR) {
    super(message, exitCode);
    this.status = status;
    this.body = body;
  }
}
