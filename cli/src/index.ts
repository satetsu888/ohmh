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
import { schemaCommand } from "./commands/schema";
import { CliError, EXIT_GENERAL_ERROR } from "./errors";
import { emitJsonError, error, setJsonMode, setQuiet, setVerbose } from "./ui/logger";

const VERSION = "0.1.0";

const main = async (argv: string[]): Promise<number> => {
  const program = new Command();

  program
    .name("ohmh")
    .description("Forward webhooks from ohmh.satetsu888.dev to your local dev server")
    .version(VERSION, "-V, --version")
    .addOption(new Option("--base-url <url>", "Override base URL (env: OH_MY_HOOKS_BASE_URL)"))
    .addOption(new Option("--json", "Emit machine-readable NDJSON output").default(false))
    .addOption(new Option("-q, --quiet", "Suppress info-level output").default(false))
    .addOption(new Option("-v, --verbose", "Enable debug output").default(false))
    .addHelpText(
      "after",
      `
Exit codes:
  0  success
  1  general error
  2  authentication error (try \`ohmh login\`)
  3  plan limit reached
  4  webhook or request not found
  5  invalid input (e.g. bad port)

Environment variables:
  OH_MY_HOOKS_BASE_URL   override base URL (default https://ohmh.satetsu888.dev)
  XDG_CONFIG_HOME        override ~/.config dir for credential storage

Plans (see https://ohmh.satetsu888.dev/settings):
  Free      $0          1 ephemeral, 0 persistent, 100 req/day
  Metered   $0 base + $0.60/mo per peak persistent webhook
            1 ephemeral, 10 persistent, 500 req/day, 30d history

For machine-readable output, pass --json. Each subcommand emits NDJSON events
on stdout (one JSON object per line); human-readable prose moves to stderr.
NDJSON consumers should ignore unknown \`type\` values for forward compatibility.
For details: https://github.com/satetsu888/ohmh/blob/main/cli/README.md
`,
    );

  // Mirror connect's options on the root so `ohmh --port 3000` works without a subcommand.
  // Explicit subcommands shadow these (Commander prefers the subcommand parser).
  program
    .option("-p, --port <port>", "Local port to forward to")
    .option("-i, --id <webhookId>", "Subscribe to an existing webhook by id")
    .option("--anonymous", "Force anonymous mode even when authenticated")
    .option("--ready-file <path>", "Touch this file with the webhook URL (JSON) once ready")
    .action(async (_opts, cmd: Command) => {
      const opts = cmd.optsWithGlobals();
      applyGlobalFlags(opts);
      await connectCommand({
        port: opts.port,
        webhookId: opts.id,
        anonymous: Boolean(opts.anonymous),
        baseUrlOverride: opts.baseUrl,
        readyFile: opts.readyFile,
      });
    });

  program
    .command("connect")
    .description("Connect and forward incoming webhooks to a local port")
    .option("-p, --port <port>", "Local port to forward to")
    .option("-i, --id <webhookId>", "Subscribe to an existing webhook by id")
    .option("--anonymous", "Force anonymous mode even when authenticated")
    .option("--ready-file <path>", "Touch this file with the webhook URL (JSON) once ready")
    .addHelpText(
      "after",
      `
Notes:
  - This is a long-running process. It exits only on SIGINT/SIGTERM.
  - Run it in the background when used from an AI agent or shell script.
  - In --json mode it emits NDJSON events on stdout (line-buffered):
      { "type": "ready", "mode": "anonymous"|"ephemeral"|"persistent",
        "webhookId": "...", "url": "...", "forwardPort": <n> }
      { "type": "request", "ts": "...", "method": "...", "path": "...",
        "status": <number|null>, "durationMs": <n>,
        "error": "..."|undefined,
        "webhookId": "...", "sourceRequestId": "..." }
  - With --ready-file <path>, that path is written (mode 0600) with a JSON
    line { "url", "webhookId", "mode" } the moment the webhook is ready.
    The file is removed on graceful shutdown.
`,
    )
    .action(async (opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await connectCommand({
        port: opts.port,
        webhookId: opts.id,
        anonymous: Boolean(opts.anonymous),
        baseUrlOverride: merged.baseUrl,
        readyFile: opts.readyFile,
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
    .description("Create a persistent webhook")
    .action(async (_opts, cmd: Command) => {
      const merged = cmd.optsWithGlobals();
      applyGlobalFlags(merged);
      await createCommand({
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
    .command("schema")
    .description("Print the JSON Schema for --json NDJSON events to stdout")
    .action(() => {
      schemaCommand();
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
    const exitCode = err instanceof CliError ? err.exitCode : EXIT_GENERAL_ERROR;
    error(err instanceof Error ? err.message : String(err));
    emitJsonError(err, exitCode);
    return exitCode;
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

// Ensure stdout writes are flushed line-by-line even when piped. Without this,
// agents that tail our stdout (Monitor tools, `tail -f`, etc.) can see seconds
// of latency on a fresh ready/request event because Node block-buffers stdout
// when it's a pipe. setBlocking(true) is the documented escape hatch:
// https://nodejs.org/api/process.html#a-note-on-process-io
const stdoutHandle = (process.stdout as unknown as { _handle?: { setBlocking?: (b: boolean) => void } })._handle;
if (stdoutHandle && typeof stdoutHandle.setBlocking === "function") {
  stdoutHandle.setBlocking(true);
}

// When piped to a consumer that closes early (`ohmh schema | head -1`,
// `... | jq <bogus>`), setBlocking turns subsequent writes into synchronous
// EPIPE throws. Treat EPIPE as a clean shutdown rather than a crash.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") {
    process.exit(0);
  }
  throw err;
});

main(process.argv).then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
});
