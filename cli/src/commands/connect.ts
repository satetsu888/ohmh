import { CliError, EXIT_AUTH_ERROR, EXIT_BAD_INPUT } from "../errors";
import { runAnonymousConnect } from "../runtime/connectAnonymous";
import { runAuthedConnect } from "../runtime/connectAuthed";
import { tryGetSession } from "../session/currentSession";
import { resolveCliConfig } from "../config";
import { isInteractive, text } from "../ui/prompt";

export type ConnectOptions = {
  port?: string;
  webhookId?: string;
  anonymous: boolean;
  baseUrlOverride?: string;
  readyFile?: string;
};

const parsePort = (input: string): number => {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CliError(`invalid port: ${input}`, EXIT_BAD_INPUT, "bad_input");
  }
  return port;
};

const promptForPort = async (): Promise<number> => {
  if (!isInteractive()) {
    throw new CliError(
      "--port is required in non-interactive environments (e.g. ohmh --port 3000)",
      EXIT_BAD_INPUT,
      "bad_input",
    );
  }
  const value = await text("Local port to forward to", (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return "Enter a port between 1 and 65535";
    }
    return true;
  });
  if (value === undefined) {
    throw new CliError("port is required", EXIT_BAD_INPUT, "bad_input");
  }
  return Number(value);
};

export const connectCommand = async (opts: ConnectOptions): Promise<void> => {
  const port = opts.port ? parsePort(opts.port) : await promptForPort();
  const config = resolveCliConfig(opts.baseUrlOverride);

  if (opts.anonymous) {
    // Force anonymous mode even when authenticated (useful for debugging).
    await runAnonymousConnect({ baseUrl: config.baseUrl, port, readyFile: opts.readyFile });
    return;
  }

  const session = await tryGetSession(opts.baseUrlOverride);
  if (!session) {
    if (opts.webhookId) {
      // Subscribing to an existing webhook requires authentication.
      throw new CliError(
        'subscribing to an existing webhook requires sign-in. Run "ohmh login" first.',
        EXIT_AUTH_ERROR,
        "auth_required",
      );
    }
    // Unauthenticated and no --id ⇒ anonymous mode (no confirm prompt).
    await runAnonymousConnect({ baseUrl: config.baseUrl, port, readyFile: opts.readyFile });
    return;
  }

  await runAuthedConnect({
    session,
    port,
    webhookId: opts.webhookId ?? null,
    readyFile: opts.readyFile,
  });
};
