import { buildSystemPrompt } from "./prompt.js";
import { toolDefinitions, executeTool } from "./tools.js";

// Base URL and model for the OpenCode Go (OpenAI-compatible) endpoint.
const LLM_BASE_URL = "https://opencode.ai/zen/go/v1";
const LLM_MODEL = "kimi-k3";

const LLM_TIMEOUT_MS = 30_000;
const MAX_ROUNDS = 8;

/** The tool whose call ends the run; its arguments are the finished artefact. */
const EMIT_TOOL = "emit_incident_comms";

/**
 * Run one thread through the loop and return {holding, internal, timeline, openQuestions}.
 *
 * The model is expected to call normalise_and_sort_events first, then EMIT_TOOL.
 * Terminating on EMIT_TOOL is what guarantees the response shape: we return the
 * call's arguments rather than parsing prose, so there is no free-text path out.
 */
export async function runDraft(thread, env) {
  const messages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: thread },
  ];

  let round = 0;
  while (round < MAX_ROUNDS) {
    round += 1;
    const assistant = await callModel(messages, env);
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

async function callModel(messages, env) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENCODE_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      tools: toolDefinitions,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`LLM returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices[0].message;
}

function parseArgs(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
