import { Command, Option } from "commander";
import { connectCommand } from "./commands/connect";
import { loginCommand } from "./commands/login";
import { logoutCommand } from "./commands/logout";
import { whoamiCommand } from "./commands/whoami";
import { listCommand } from "./commands/list";
import { createCommand } from "./commands/create";
import { deleteCommand } from "./commands/delete";
import { requestsCommand } from "./commands/requests";
import { requestCommand } from "./commands/request";
import { resendCommand } from "./commands/resend";
import { CliError } from "./errors";
import { error, setJsonMode, setQuiet, setVerbose } from "./ui/logger";

const VERSION = "0.1.0";

const main = async (argv: string[]): Promise<number> => {
  const program = new Command();

  program
    .name("ohmh")
    .description("Forward webhooks from oh-my-hooks.com to your local dev server")
    .version(VERSION, "-V, --version")
    .addOption(new Option("--base-url <url>", "Override base URL (env: OH_MY_HOOKS_BASE_URL)"))
    .addOption(new Option("--json", "Emit machine-readable NDJSON output").default(false))
    .addOption(new Option("-q, --quiet", "Suppress info-level output").default(false))
    .addOption(new Option("-v, --verbose", "Enable debug output").default(false));

  // Mirror connect's options on the root so `ohmh --port 3000` works without a subcommand.
  // Explicit subcommands shadow these (Commander prefers the subcommand parser).
  program
    .option("-p, --port <port>", "Local port to forward to")
    .option("-i, --id <webhookId>", "Subscribe to an existing webhook by id")
    .option("--anonymous", "Force anonymous mode even when authenticated")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      applyGlobalFlags(opts);
      await connectCommand({
        port: opts.port,
        webhookId: opts.id,
        anonymous: Boolean(opts.anonymous),
        baseUrlOverride: opts.baseUrl,
      });
    });

  program
    .command("connect")
    .description("Connect and forward incoming webhooks to a local port")
    .option("-p, --port <port>", "Local port to forward to")
    .option("-i, --id <webhookId>", "Subscribe to an existing webhook by id")
    .option("--anonymous", "Force anonymous mode even when authenticated")
    .action(async (opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await connectCommand({
        port: opts.port,
        webhookId: opts.id,
        anonymous: Boolean(opts.anonymous),
        baseUrlOverride: merged.baseUrl,
      });
    });

  program
    .command("login")
    .description("Sign in via browser (PKCE)")
    .action(async (_opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await loginCommand({ baseUrlOverride: merged.baseUrl });
    });

  program
    .command("logout")
    .description("Forget the saved access token")
    .action(async (_opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await logoutCommand({ baseUrlOverride: merged.baseUrl });
    });

  program
    .command("whoami")
    .description("Show the currently signed-in user and plan")
    .action(async (_opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await whoamiCommand({ baseUrlOverride: merged.baseUrl });
    });

  program
    .command("list")
    .description("List your webhooks")
    .action(async (_opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await listCommand({ baseUrlOverride: merged.baseUrl });
    });

  program
    .command("create")
    .description("Create a persistent or custom URL webhook")
    .option("--persistent", "Create a persistent webhook (default)")
    .option("--custom <subdomain>", "Create a custom URL webhook (Pro plan)")
    .action(async (opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await createCommand({
        persistent: Boolean(opts.persistent),
        custom: typeof opts.custom === "string" ? opts.custom : undefined,
        baseUrlOverride: merged.baseUrl,
      });
    });

  program
    .command("delete <id>")
    .description("Delete a webhook")
    .option("--yes", "Skip confirmation prompt")
    .action(async (id: string, opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await deleteCommand({
        webhookId: id,
        skipConfirm: Boolean(opts.yes),
        baseUrlOverride: merged.baseUrl,
      });
    });

  program
    .command("requests <id>")
    .description("Show recent requests received by a webhook")
    .option("--limit <n>", "Max number of rows", "20")
    .option("--offset <n>", "Offset for pagination", "0")
    .action(async (id: string, opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await requestsCommand({
        webhookId: id,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
        baseUrlOverride: merged.baseUrl,
      });
    });

  program
    .command("request <id> <reqId>")
    .description("Show full headers and body of a single request")
    .action(async (id: string, reqId: string, _opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await requestCommand({
        webhookId: id,
        requestId: reqId,
        baseUrlOverride: merged.baseUrl,
      });
    });

  program
    .command("resend <id> <reqId>")
    .description("Resend a past request to a local port (via local forwarder, no server roundtrip)")
    .requiredOption("-p, --port <port>", "Local port to forward to")
    .action(async (id: string, reqId: string, opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await resendCommand({
        webhookId: id,
        requestId: reqId,
        port: Number(opts.port),
        baseUrlOverride: merged.baseUrl,
      });
    });

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      error(err.message);
      return err.exitCode;
    }
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }
};

const applyGlobalFlags = (opts: Record<string, unknown>): void => {
  if (opts.json) {
    setJsonMode(true);
  }
  if (opts.quiet) {
    setQuiet(true);
  }
  if (opts.verbose) {
    setVerbose(true);
  }
};

main(process.argv).then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
});
