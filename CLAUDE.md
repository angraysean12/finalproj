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

**`tool_choice` is deliberately left on auto.** Forcing `emit_incident_comms` would
stop `normalise_and_sort_events` ever being called. The prompt orders the sequence
instead.

**`normaliseAndSortEvents` reports, never resolves.** A timestamp clash or an
unreadable time comes back in `notes` for the model to surface. Do not make it pick a
winner — the whole product claim is that the app does not quietly invent certainty.
For the same reason it **never drops an event**: an unreadable timestamp keeps its
original wording and sorts to the end. A missing message is worse than an unsorted one.

**Keep new logic on the pure side.** `src/tools.js` exports `parseClock`,
`formatClock` and `normaliseAndSortEvents` with no network, DOM or storage access.
They are the only tested code and the only deterministic part of the app.

**The UI treats model output as untrusted markup.** `src/ui.html` renders with
`textContent` and `createElement`, never `innerHTML`. Statement text, timeline rows
and status values all come from the model. The status badge falls back to `unknown`
for any value outside the enum rather than styling an arbitrary string.

**Secrets.** `OPENCODE_API_KEY` comes from `.env` locally (gitignored) and
`wrangler secret put` in production. Never in `wrangler.toml`, never in code.

## Fixtures are the eval set

`fixtures/` holds threads planted with specific traps: out-of-order messages,
contradicting timestamps, an unreadable time, an unconfirmed root-cause guess, a named
colleague, a joke. Changing the prompt means re-running both and checking the guess
stays out of `holding`, no name appears in either statement, and the joke is not a
timeline row. Add a fixture when you add a trap.

**Never paste a real incident thread into the model endpoint.**

## Model

`src/loop.js` pins `LLM_BASE_URL` and `LLM_MODEL` (OpenCode Go, `kimi-k3`). Swapping
provider is those two constants plus the auth header in `callModel`. The judgement
quality *is* the product here, so if output looks weak, the model string is the first
thing to try.
