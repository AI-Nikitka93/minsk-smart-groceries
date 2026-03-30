import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";
import casesDocument from "./golden-set.cases.json";

type GoldenSetDocument = {
  version: number;
  cases: GoldenSetCase[];
};

type GoldenSetCase = {
  id: string;
  description: string;
  turns: string[];
  expect: GoldenSetExpectations;
};

type GoldenSetExpectations = {
  botRepliesAtLeast?: number;
  profile?: {
    budgetMinor?: number;
    householdSize?: number;
  };
  session?: {
    lastAction?: string;
    lastActionOneOf?: string[];
    lastOutcomeStatus?: string;
    lastOutcomeStatusOneOf?: string[];
    lastCatalogQueriesLength?: number;
    lastCatalogQueriesIncludes?: string[];
  };
};

type SessionSnapshot = {
  lastUserQuery: string | null;
  lastAction: string | null;
  lastCatalogQueries: string[];
  lastClarificationQuestion: string | null;
  lastOutcomeStatus: string | null;
  updatedAt: string | null;
};

type ProfileSnapshot = {
  budgetMinor: number | null;
  householdSize: number | null;
  session: SessionSnapshot;
};

type GoldenSetCaseResult = {
  id: string;
  description: string;
  passed: boolean;
  issues: string[];
  hookStatuses: number[];
  botReplyCount: number;
  profile: ProfileSnapshot;
};

type GoldenSetRunResult = {
  version: number;
  checkedAt: string;
  workerUrl: string;
  chatId: number;
  passed: boolean;
  passRate: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: GoldenSetCaseResult[];
};

const DEFAULT_WORKER_URL = "https://minsk-smart-groceries-bot.aiartnikitka93.workers.dev/webhook";
const DEFAULT_ADMIN_CHAT_ID = 6297262714;
const CASE_DELAY_MS = 2200;

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(".env.operator.local") });

  const workerUrl = process.env.BOT_WORKER_URL ?? DEFAULT_WORKER_URL;
  const chatId = Number(process.env.ADMIN_CHAT_ID ?? DEFAULT_ADMIN_CHAT_ID);
  const botToken = requireEnv("BOT_TOKEN");
  const webhookSecret = requireEnv("WEBHOOK_SECRET");
  const tursoUrl = requireEnv("TURSO_DATABASE_URL");
  const tursoAuthToken = requireEnv("TURSO_AUTH_TOKEN");
  if (!Number.isFinite(chatId) || chatId <= 0) {
    throw new Error("ADMIN_CHAT_ID must be a positive number.");
  }

  const db = createClient({
    url: tursoUrl,
    authToken: tursoAuthToken,
  });

  const document = casesDocument as GoldenSetDocument;
  const results: GoldenSetCaseResult[] = [];

  for (const testCase of document.cases) {
    const result = await runCase({
      testCase,
      botToken,
      webhookSecret,
      workerUrl,
      chatId,
      db,
    });
    results.push(result);
  }

  const passedCount = results.filter((result) => result.passed).length;
  const report: GoldenSetRunResult = {
    version: document.version,
    checkedAt: new Date().toISOString(),
    workerUrl,
    chatId,
    passed: passedCount === results.length,
    passRate: `${passedCount}/${results.length}`,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
    },
    results,
  };

  const artifactsDir = path.resolve("docs", "evals");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, "golden-set-latest.json"),
    JSON.stringify(report, null, 2),
  );

  printSummary(report);

  if (!report.passed) {
    process.exitCode = 1;
  }
}

async function runCase(input: {
  testCase: GoldenSetCase;
  botToken: string;
  webhookSecret: string;
  workerUrl: string;
  chatId: number;
  db: ReturnType<typeof createClient>;
}): Promise<GoldenSetCaseResult> {
  const { testCase, botToken, webhookSecret, workerUrl, chatId, db } = input;
  const beforeMarker = await callTelegramApi(botToken, "sendMessage", {
    chat_id: chatId,
    text: `[golden-set before] ${testCase.id}`,
  });

  const hookStatuses: number[] = [];
  for (const turn of testCase.turns) {
    hookStatuses.push(await sendSyntheticWebhook(workerUrl, webhookSecret, chatId, turn));
    await delay(CASE_DELAY_MS);
  }

  const afterMarker = await callTelegramApi(botToken, "sendMessage", {
    chat_id: chatId,
    text: `[golden-set after] ${testCase.id}`,
  });

  const botReplyCount = Math.max(0, Number(afterMarker.message_id) - Number(beforeMarker.message_id) - 1);
  const { profile, issues } = await waitForCaseStabilization({
    expect: testCase.expect,
    hookStatuses,
    botReplyCount,
    db,
    chatId,
  });

  return {
    id: testCase.id,
    description: testCase.description,
    passed: issues.length === 0,
    issues,
    hookStatuses,
    botReplyCount,
    profile,
  };
}

async function waitForCaseStabilization(input: {
  expect: GoldenSetExpectations;
  hookStatuses: number[];
  botReplyCount: number;
  db: ReturnType<typeof createClient>;
  chatId: number;
}): Promise<{ profile: ProfileSnapshot; issues: string[] }> {
  let lastProfile = await readProfileSnapshot(input.db, input.chatId);
  let lastIssues = collectIssues(input.expect, input.hookStatuses, input.botReplyCount, lastProfile);

  if (lastIssues.length === 0) {
    return { profile: lastProfile, issues: lastIssues };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await delay(500);
    lastProfile = await readProfileSnapshot(input.db, input.chatId);
    lastIssues = collectIssues(input.expect, input.hookStatuses, input.botReplyCount, lastProfile);
    if (lastIssues.length === 0) {
      return { profile: lastProfile, issues: lastIssues };
    }
  }

  return { profile: lastProfile, issues: lastIssues };
}

async function callTelegramApi(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ message_id: number }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!data.ok || !data.result) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? "unknown error"}`);
  }
  return data.result;
}

async function sendSyntheticWebhook(
  workerUrl: string,
  webhookSecret: string,
  chatId: number,
  text: string,
): Promise<number> {
  const now = Date.now();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": webhookSecret,
    },
    body: JSON.stringify({
      update_id: now,
      message: {
        message_id: Math.floor(now / 1000),
        date: Math.floor(now / 1000),
        chat: {
          id: chatId,
          type: "private",
        },
        from: {
          id: chatId,
          is_bot: false,
          first_name: "AI Nikitka93",
          username: "AI_Nikitka93",
          language_code: "ru",
        },
        text,
      },
    }),
  });
  return response.status;
}

async function readProfileSnapshot(
  db: ReturnType<typeof createClient>,
  chatId: number,
): Promise<ProfileSnapshot> {
  const result = await retryAsync(
    async () =>
      db.execute({
        sql: "select budget_minor, household_size, notification_settings from user_profile where telegram_user_id = ? limit 1",
        args: [chatId],
      }),
    3,
    1000,
  );
  const row = result.rows[0] as
    | {
        budget_minor?: unknown;
        household_size?: unknown;
        notification_settings?: unknown;
      }
    | undefined;

  const notificationSettings = row?.notification_settings ? safeParseJson(String(row.notification_settings)) : {};
  const sessionContext = asObject(notificationSettings.sessionContext);

  return {
    budgetMinor: toNumberOrNull(row?.budget_minor),
    householdSize: toNumberOrNull(row?.household_size),
    session: {
      lastUserQuery: toStringOrNull(sessionContext.lastUserQuery),
      lastAction: toStringOrNull(sessionContext.lastAction),
      lastCatalogQueries: Array.isArray(sessionContext.lastCatalogQueries)
        ? sessionContext.lastCatalogQueries.map((value) => String(value))
        : [],
      lastClarificationQuestion: toStringOrNull(sessionContext.lastClarificationQuestion),
      lastOutcomeStatus: toStringOrNull(sessionContext.lastOutcomeStatus),
      updatedAt: toStringOrNull(sessionContext.updatedAt),
    },
  };
}

function collectIssues(
  expect: GoldenSetExpectations,
  hookStatuses: number[],
  botReplyCount: number,
  profile: ProfileSnapshot,
): string[] {
  const issues: string[] = [];

  if (hookStatuses.some((status) => status !== 200)) {
    issues.push(`Expected all webhook statuses to be 200, got [${hookStatuses.join(", ")}].`);
  }

  if (typeof expect.botRepliesAtLeast === "number" && botReplyCount < expect.botRepliesAtLeast) {
    issues.push(`Expected at least ${expect.botRepliesAtLeast} bot replies, got ${botReplyCount}.`);
  }

  if (expect.profile?.budgetMinor !== undefined && profile.budgetMinor !== expect.profile.budgetMinor) {
    issues.push(`Expected budgetMinor=${expect.profile.budgetMinor}, got ${String(profile.budgetMinor)}.`);
  }

  if (expect.profile?.householdSize !== undefined && profile.householdSize !== expect.profile.householdSize) {
    issues.push(`Expected householdSize=${expect.profile.householdSize}, got ${String(profile.householdSize)}.`);
  }

  const sessionExpect = expect.session;
  if (sessionExpect?.lastAction !== undefined && profile.session.lastAction !== sessionExpect.lastAction) {
    issues.push(`Expected lastAction=${sessionExpect.lastAction}, got ${String(profile.session.lastAction)}.`);
  }

  if (
    Array.isArray(sessionExpect?.lastActionOneOf) &&
    !sessionExpect.lastActionOneOf.includes(String(profile.session.lastAction))
  ) {
    issues.push(
      `Expected lastAction in [${sessionExpect.lastActionOneOf.join(", ")}], got ${String(profile.session.lastAction)}.`,
    );
  }

  if (
    sessionExpect?.lastOutcomeStatus !== undefined &&
    profile.session.lastOutcomeStatus !== sessionExpect.lastOutcomeStatus
  ) {
    issues.push(
      `Expected lastOutcomeStatus=${sessionExpect.lastOutcomeStatus}, got ${String(profile.session.lastOutcomeStatus)}.`,
    );
  }

  if (
    Array.isArray(sessionExpect?.lastOutcomeStatusOneOf) &&
    !sessionExpect.lastOutcomeStatusOneOf.includes(String(profile.session.lastOutcomeStatus))
  ) {
    issues.push(
      `Expected lastOutcomeStatus in [${sessionExpect.lastOutcomeStatusOneOf.join(", ")}], got ${String(profile.session.lastOutcomeStatus)}.`,
    );
  }

  if (
    typeof sessionExpect?.lastCatalogQueriesLength === "number" &&
    profile.session.lastCatalogQueries.length !== sessionExpect.lastCatalogQueriesLength
  ) {
    issues.push(
      `Expected lastCatalogQueries length=${sessionExpect.lastCatalogQueriesLength}, got ${profile.session.lastCatalogQueries.length}.`,
    );
  }

  if (Array.isArray(sessionExpect?.lastCatalogQueriesIncludes)) {
    for (const expectedValue of sessionExpect.lastCatalogQueriesIncludes) {
      if (!profile.session.lastCatalogQueries.includes(expectedValue)) {
        issues.push(`Expected lastCatalogQueries to include "${expectedValue}".`);
      }
    }
  }

  return issues;
}

function printSummary(report: GoldenSetRunResult): void {
  console.log(`Golden Set v${report.version}`);
  console.log(`Checked at: ${report.checkedAt}`);
  console.log(`Worker: ${report.workerUrl}`);
  console.log(`Pass rate: ${report.passRate}`);
  for (const result of report.results) {
    console.log(`- ${result.id}: ${result.passed ? "PASS" : "FAIL"} | replies=${result.botReplyCount} | action=${result.profile.session.lastAction ?? "null"} | outcome=${result.profile.session.lastOutcomeStatus ?? "null"}`);
    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        console.log(`  issue: ${issue}`);
      }
    }
  }
}

function safeParseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return asObject(parsed);
  } catch {
    return {};
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryAsync<T>(
  operation: () => Promise<T>,
  attempts: number,
  delayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}

void main();
