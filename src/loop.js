import { buildSystemPrompt } from "./prompt.js";
import {
  EMIT_TOOL,
  executeTool,
  normaliseAndSortEvents,
  parseThread,
  toolsFor,
} from "./tools.js";

// Base URL and model for the OpenCode Go (OpenAI-compatible) endpoint.
// Override the model with LLM_MODEL in .env (or `wrangler secret put`) — latency
// varies by more than 5x across the models this endpoint offers.
const LLM_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_LLM_MODEL = "deepseek-v4-flash";

// The default model is a reasoning model, and its hidden reasoning — not the
// artefact it writes — is most of the wall clock. Measured on
// fixtures/phishing-credentials.txt: default 112s / 8106 output tokens / 29k
// reasoning chars; "low" 50s / 3137; "minimal" 16s / 1986. This is the single
// biggest lever on latency, worth far more than swapping models.
const DEFAULT_REASONING_EFFORT = "minimal";

const LLM_TIMEOUT_MS = 120_000;
const MAX_ROUNDS = 8;

/** Below this, the paste probably is not a "time speaker: text" thread. */
const MIN_PARSED_EVENTS = 3;

/**
 * Does the server-side parse look good enough to trust?
 *
 * A pasted export we cannot read comes back as a handful of `unknown` speakers.
 * In that case we hand the raw thread to the model and let it extract, which is
 * slower but works on anything.
 */
function looksLikeThread(events) {
  if (events.length < MIN_PARSED_EVENTS) return false;
  const named = events.filter((e) => e.speaker !== "unknown").length;
  return named / events.length >= 0.6;
}

/**
 * Run one thread through the loop and return {holding, internal, timeline, openQuestions}.
 *
 * Fast path: the thread is parsed and ordered here, the model is handed the ordered
 * events and only `emit_incident_comms`, and the run is ONE round. Slow path: the
 * model extracts the messages itself, calls the sort tool, then emits — two rounds.
 *
 * Terminating on EMIT_TOOL is what guarantees the response shape: we return the
 * call's arguments rather than parsing prose, so there is no free-text path out.
 */
export async function runDraft(thread, env) {
  const parsed = parseThread(thread);
  const preSorted = looksLikeThread(parsed) ? normaliseAndSortEvents(parsed) : null;
  const tools = toolsFor(preSorted);

  console.log(
    preSorted
      ? `parsed ${parsed.length} events server-side; single-round path`
      : `could not parse thread; falling back to model extraction`,
  );

  const messages = [
    { role: "system", content: buildSystemPrompt(preSorted) },
    {
      role: "user",
      content: preSorted ? "Draft the comms for this incident." : thread,
    },
  ];

  let round = 0;
  while (round < MAX_ROUNDS) {
    round += 1;
    const assistant = await callModel(messages, tools, env);
    messages.push(assistant);

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // The model answered in prose instead of calling EMIT_TOOL. Push it back
      // rather than failing: one nudge usually recovers the run.
      messages.push({
        role: "user",
        content: `Do not reply in prose. Call ${EMIT_TOOL} with the finished artefacts.`,
      });
      continue;
    }

    for (const call of toolCalls) {
      const args = parseArgs(call.function.arguments);

      if (call.function.name === EMIT_TOOL) {
        return args;
      }

      console.log(`round ${round}: ${call.function.name}`);
      const result = await executeTool(call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  throw new Error(`Model did not call ${EMIT_TOOL} within ${MAX_ROUNDS} rounds`);
}

async function callModel(messages, tools, env) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || DEFAULT_LLM_MODEL,
      reasoning_effort: env.LLM_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
      messages,
      tools,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`LLM returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  // Output tokens are what the wall clock is actually made of, so log them: a
  // change that looks like a speed-up is only real if this number moved.
  const u = data.usage ?? {};
  console.log(`usage in=${u.prompt_tokens ?? "?"} out=${u.completion_tokens ?? "?"}`);

  return data.choices[0].message;
}

function parseArgs(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
