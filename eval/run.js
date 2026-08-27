/**
 * Run every fixture through the real draft loop and check its planted traps.
 *
 * `npm run eval` — all four fixtures, one at a time
 * `npm run eval -- phishing` — only fixtures whose name matches
 *
 * Exits non-zero if any trap fails, so a prompt or model change that got dumber
 * fails loudly instead of being noticed three commits later. Latency and the
 * path taken are reported alongside, because a faster setting that breaks a trap
 * is not a faster setting.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runDraft } from "../src/loop.js";
import { parseThread } from "../src/tools.js";
import { FIXTURES, STRUCTURAL, UNCHECKABLE } from "./traps.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  // No .env — fall back to whatever is already in the environment.
}

if (!process.env.OPENCODE_API_KEY) {
  console.error("OPENCODE_API_KEY is not set. Put it in .env or export it.");
  process.exit(2);
}

const env = {
  OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL,
  LLM_REASONING_EFFORT: process.env.LLM_REASONING_EFFORT,
};

const filter = process.argv[2];
const selected = filter
  ? FIXTURES.filter((f) => f.name.includes(filter) || f.file.includes(filter))
  : FIXTURES;

if (selected.length === 0) {
  console.error(`No fixture matches "${filter}".`);
  process.exit(2);
}

/**
 * Run one fixture. The loop logs which path it took and what the round cost;
 * capture those for the report.
 *
 * Runs are sequential, and that is deliberate rather than lazy: capturing the
 * loop's output means swapping `console.log`, and two runs doing that at once
 * restore each other's stub and silently swallow every later line. Sequential
 * also makes the per-fixture seconds mean something.
 */
async function evaluate(fixture) {
  const thread = readFileSync(join(root, "fixtures", fixture.file), "utf8");
  const ctx = { messageCount: parseThread(thread).length };

  const logged = [];
  const realLog = console.log;
  console.log = (...args) => logged.push(args.join(" "));

  const started = performance.now();
  let result;
  let error = null;
  try {
    result = await runDraft(thread, env);
  } catch (err) {
    error = err;
  } finally {
    console.log = realLog;
  }
  const seconds = (performance.now() - started) / 1000;

  if (error) {
    return { fixture, seconds, error, checks: [], path: "—", usage: "—" };
  }

  const checks = [...STRUCTURAL, ...fixture.traps].map(({ trap, check }) => {
    let reason;
    try {
      reason = check(result, ctx);
    } catch (err) {
      reason = `check threw: ${err.message}`;
    }
    return { trap, reason };
  });

  return {
    fixture,
    seconds,
    result,
    checks,
    path: logged.find((l) => l.includes("path")) ?? "—",
    usage: logged.find((l) => l.startsWith("usage")) ?? "—",
  };
}

const runs = [];
for (const fixture of selected) {
  process.stderr.write(`running ${fixture.name}…\n`);
  runs.push(await evaluate(fixture));
}

let failed = 0;
let total = 0;

for (const run of runs) {
  const { fixture } = run;
  console.log(`\n\x1b[1m${fixture.name}\x1b[0m  (${fixture.file})`);

  if (run.error) {
    console.log(`  \x1b[31mrun failed\x1b[0m — ${run.error.message}`);
    failed += 1;
    total += 1;
    continue;
  }

  console.log(
    `  ${run.seconds.toFixed(1)}s · ${run.result.timeline?.length ?? 0} rows · ` +
      `${run.path.replace(/;.*/, "")} · ${run.usage}`,
  );

  for (const { trap, reason } of run.checks) {
    total += 1;
    if (reason) {
      failed += 1;
      console.log(`  \x1b[31m✗\x1b[0m ${trap}\n      ${reason}`);
    } else {
      console.log(`  \x1b[32m✓\x1b[0m ${trap}`);
    }
  }
}

console.log(`\n${total - failed}/${total} traps held.`);
console.log(`\nNot checked here — a fluent wrong answer passes all of the above and still fails these:`);
for (const gap of UNCHECKABLE) console.log(`  · ${gap}`);

process.exit(failed > 0 ? 1 : 0);
