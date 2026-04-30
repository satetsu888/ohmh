import { CliError, EXIT_BAD_INPUT } from "../errors";
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
};

const parsePort = (input: string): number => {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CliError(`invalid port: ${input}`, EXIT_BAD_INPUT);
  }
  return port;
};

const promptForPort = async (): Promise<number> => {
  if (!isInteractive()) {
    throw new CliError("--port is required (e.g. ohmh --port 3000)", EXIT_BAD_INPUT);
  }
  const value = await text("Local port to forward to", (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return "Enter a port between 1 and 65535";
    }
    return true;
  });
  if (value === undefined) {
    throw new CliError("port is required", EXIT_BAD_INPUT);
  }
  return Number(value);
};

export const connectCommand = async (opts: ConnectOptions): Promise<void> => {
  const port = opts.port ? parsePort(opts.port) : await promptForPort();
  const config = resolveCliConfig(opts.baseUrlOverride);

  if (opts.anonymous) {
    // 認証済でも明示的に anonymous を強制 (デバッグ用)
    await runAnonymousConnect({ baseUrl: config.baseUrl, port });
    return;
  }

  const session = await tryGetSession(opts.baseUrlOverride);
  if (!session) {
    if (opts.webhookId) {
      // 既存 webhook の購読は認証必須
      throw new CliError(
        'subscribing to an existing webhook requires sign-in. Run "ohmh login" first.',
      );
    }
    // 未認証 + --id 未指定 ⇒ anonymous (確認 prompt なし)
    await runAnonymousConnect({ baseUrl: config.baseUrl, port });
    return;
  }

  await runAuthedConnect({ session, port, webhookId: opts.webhookId ?? null });
};
