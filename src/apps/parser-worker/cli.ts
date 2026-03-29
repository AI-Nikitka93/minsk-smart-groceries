import parserWorker from "./index";

interface CliParserEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  PARSER_PAGE_SIZE?: string;
  PARSER_LOCK_TTL_SECONDS?: string;
}

interface CliScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
  readonly type: "scheduled";
  noRetry(): void;
}

interface CliExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function main(): Promise<void> {
  const env = readEnv();
  const controller = createScheduledController(process.argv[2]);
  const pending: Promise<unknown>[] = [];
  const ctx: CliExecutionContext = {
    waitUntil(promise) {
      pending.push(
        promise.catch((error) => {
          console.error("[parser-cli] waitUntil task failed", error);
          throw error;
        }),
      );
    },
  };

  console.log(
    JSON.stringify(
      {
        service: "parser-worker-cli",
        startedAt: new Date(controller.scheduledTime).toISOString(),
        cron: controller.cron,
        pageSize: env.PARSER_PAGE_SIZE ?? null,
      },
      null,
      2,
    ),
  );

  await parserWorker.scheduled(controller, env, ctx);
  await Promise.all(pending);

  console.log(
    JSON.stringify(
      {
        service: "parser-worker-cli",
        status: "ok",
        finishedAt: new Date().toISOString(),
        cron: controller.cron,
      },
      null,
      2,
    ),
  );
}

function readEnv(): CliParserEnv {
  const databaseUrl = readRequiredEnv("TURSO_DATABASE_URL", process.env.TURSO_URL);
  const authToken = readRequiredEnv("TURSO_AUTH_TOKEN");

  return {
    TURSO_DATABASE_URL: databaseUrl,
    TURSO_AUTH_TOKEN: authToken,
    PARSER_PAGE_SIZE: process.env.PARSER_PAGE_SIZE,
    PARSER_LOCK_TTL_SECONDS: process.env.PARSER_LOCK_TTL_SECONDS,
  };
}

function createScheduledController(cronOverride?: string): CliScheduledController {
  const cron = cronOverride && cronOverride.trim().length > 0 ? cronOverride : "0 * * * *";

  return {
    cron,
    scheduledTime: Date.now(),
    type: "scheduled",
    noRetry() {
      console.warn("[parser-cli] noRetry() requested by parser-worker");
    },
  };
}

function readRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

main().catch((error) => {
  console.error("[parser-cli] fatal error", error);
  process.exitCode = 1;
});
