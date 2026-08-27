# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Cloudflare Worker that turns a pasted incident thread into three artefacts: an
external holding statement, an internal update, and a sourced timeline. Built to a
course brief requiring the back-end model to make a judgement that could not be
expressed as fixed rules.

## Commands

```sh
npm run dev                       # wrangler dev, http://localhost:8787
npm test                          # node:test over src/tools.js
node --test test/events.test.js   # a single test file
npm run deploy                    # wrangler deploy
```

## Architecture

`src/index.js` routes: `GET /` serves `src/ui.html`, `POST /draft` runs the loop in
`src/loop.js`. The loop calls an OpenAI-compatible endpoint with the tools from
`src/tools.js`. `src/prompt.js` builds the system prompt.

`wrangler.toml`'s `[[rules]] type = "Text"` block is **load-bearing** — it is what
makes `import ui from "./ui.html"` work. Do not remove it.

## The rules that are load-bearing

**The response shape is guaranteed by terminating on a tool call, not by parsing.**
`runDraft` returns the arguments of the `emit_incident_comms` call. That tool has no
implementation; its schema *is* the response contract. If you need to change the
response shape, change that schema — nothing else reads or reshapes it. Do not add a
path that returns model prose: it would let an unvalidated shape reach the UI.

**There are two paths, and the fast one is the default.** `parseThread` reads the
thread server-side; if the parse looks trustworthy (`looksLikeThread`), the ordered
events go into the system prompt, only `emit_incident_comms` is offered, and the run is
ONE round. If it does not, the raw thread goes to the model and it extracts, sorts and
emits over two rounds. Both paths end the same way, so nothing downstream cares which
ran — check the log line if you need to know.

**`tool_choice` is deliberately left on auto.** On the fallback path, forcing
`emit_incident_comms` would stop `normalise_and_sort_events` ever being called. Tool
availability, not `tool_choice`, is what constrains the fast path.

**Latency is hidden reasoning, not the artefact.** `reasoning_effort` defaults to
`minimal` (`LLM_REASONING_EFFORT` overrides). On `fixtures/phishing-credentials.txt`
with `deepseek-v4-flash`: default 112s / 8106 output tokens / 29k reasoning chars;
`low` 50s / 3137; `minimal` 16s / 1986. Same traps pass at `minimal`. If you find a
judgement it gets wrong, raise this before you change the model.

**The output caps are load-bearing, not cosmetic.** Timeline at most 8 rows,
`openQuestions` at most 4, holding 120 words, internal 150. Output tokens are the wall
clock, so a loosened cap is a slower app. The row cap also forces the model to merge
messages into events rather than transcribe them — which is what stopped it writing
"a Finance staff member said **she** entered her password", an identifying detail that
survived the no-names rule.

**`normaliseAndSortEvents` reports, never resolves.** A timestamp clash or an
unreadable time comes back in `notes` for the model to surface. Do not make it pick a
winner — the whole product claim is that the app does not quietly invent certainty.
For the same reason it **never drops an event**: an unreadable timestamp keeps its
original wording and sorts to the end. A missing message is worse than an unsorted one.

**Keep new logic on the pure side.** `src/tools.js` exports `parseThread`,
`parseClock`, `formatClock` and `normaliseAndSortEvents` with no network, DOM or
storage access. They are the only tested code and the only deterministic part of the
app — and the more work they do, the less the model has to, which is both cheaper and
more predictable.

**The UI treats model output as untrusted markup.** `src/ui.html` renders with
`textContent` and `createElement`, never `innerHTML`. Statement text, timeline rows
and status values all come from the model. The status badge falls back to `unknown`
for any value outside the enum rather than styling an arbitrary string.

**Secrets.** `OPENCODE_API_KEY` comes from `.env` locally (gitignored) and
`wrangler secret put` in production. Never in `wrangler.toml`, never in code.

## Fixtures are the eval set

`fixtures/` holds threads planted with specific traps: out-of-order messages,
contradicting timestamps, an unreadable time, an unconfirmed root-cause guess, a named
colleague, a joke. See `fixtures/README.md` for the full trap-by-trap table. Changing
the prompt means re-running all three and checking the guess
stays out of `holding`, no name appears in either statement, and the joke is not a
timeline row. Add a fixture when you add a trap.

**Never paste a real incident thread into the model endpoint.**

## Model

`src/loop.js` pins `LLM_BASE_URL` (OpenCode Go) and `DEFAULT_LLM_MODEL`, which
`env.LLM_MODEL` overrides — set it in `.env` or with `wrangler secret put`. Swapping
provider entirely is the base URL plus the auth header in `callModel`.

**Latency varies by more than 5x across this endpoint's models, and it is the app's
main weakness.** Measured on `fixtures/portal-outage.txt`, round 1 only:

| Model | Round 1 | End-to-end |
| --- | --- | --- |
| `deepseek-v4-flash` (default) | 13s | 17s |
| `kimi-k2.7-code` | 15s | — |
| `minimax-m3` | 27s | — |
| `kimi-k3` | 29s | 114s |
| `glm-5.3` | 32s | — |
| `glm-5.3-flash` | 78s | — |
| `minimax-m2.7` | 500 error | — |

"Flash" in a model name predicts nothing — `glm-5.3-flash` was the slowest of the set.
Re-measure rather than assume. `kimi-k3` is a reasoning model and also never populated
`openQuestions` across two runs, where `deepseek-v4-flash` does.

Judgement quality *is* the product. If output looks weak, raise `reasoning_effort`
before you change the model — it is the cheaper knob and the one with the larger
effect. Either way, re-run all three fixtures afterwards: the traps are the only thing
that tells you whether a faster setting got dumber.
