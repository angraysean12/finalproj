# Incident Comms

Paste a messy incident thread. Get back a holding statement, an internal update
and a sourced timeline.

Built for the TinkerAcademy final project brief: an app whose back-end model makes
a judgement that would be difficult to express as fixed rules.

## The judgement

Threads written during an incident are a mess. They arrive out of order, two people
disagree about when something happened, someone guesses at root cause and the guess
gets repeated until it sounds like fact, and someone names a colleague.

Turning that into publishable comms is not a formatting problem. The calls that matter:

- **Confirmed or alleged?** Someone with direct knowledge saying "portal is returning
  504s" is a fact. "It's the database again" is a guess, no matter how many people
  repeat it. The holding statement carries only the first kind.
- **What to withhold.** No individual is ever named. No unconfirmed cause is stated.
  Nothing implies blame.
- **What the timeline actually is**, when timestamps contradict each other or cannot
  be read at all.

None of that reduces to a rule you could write as a `switch`.

## Architecture

A single Cloudflare Worker. `src/index.js` serves `src/ui.html` on `GET /` and hands
`POST /draft` to the loop in `src/loop.js`, which calls an OpenAI-compatible chat
completions endpoint with the tools from `src/tools.js`.

```
POST /draft {thread}
  parseThread + normaliseAndSortEvents          (server-side, no model)
  one round   model judges the ordered events, calls emit_incident_comms
  → that call's arguments are the response

  fallback, when the paste cannot be parsed:
  round 1     model extracts messages, calls normalise_and_sort_events
  round 2     model drafts from the sorted events, calls emit_incident_comms
```

Two tools:

| Tool | What it does |
| --- | --- |
| `normalise_and_sort_events` | Orders extracted messages by time; flags unreadable timestamps and clashes. Only reached on the fallback path — the fast path calls the same pure function directly. |
| `emit_incident_comms` | Definition only. Its schema **is** the response contract. |

`parseThread` reads `<time> <speaker>: <text>` lines server-side, so the model never has
to re-type the thread as JSON just to get it sorted. On the fast path only
`emit_incident_comms` is offered, which is what collapses the run to one round.

**Terminating on `emit_incident_comms` is what guarantees the response shape.** The
loop returns that call's arguments rather than parsing prose, so there is no free-text
path out. `tool_choice` is deliberately left on auto so the sort tool still gets to run
first.

`normalise_and_sort_events` exists because models are unreliable at exactly this:
deciding whether `2.32pm` precedes `14:40`, and noticing that two messages claim the
same minute. It reports rather than resolves — a timestamp clash comes back as a note
so the model can say the thread disagrees, instead of silently picking one reading.

## Setup

```sh
npm install
cp .env.example .env      # then fill in OPENCODE_API_KEY
npm run dev               # http://localhost:8787
```

`.env` is gitignored. Production reads the key from a Cloudflare secret:

```sh
wrangler secret put OPENCODE_API_KEY
npm run deploy
```

Never put the key in `wrangler.toml` or in code.

## Develop

```sh
npm test                          # node:test over the pure logic in src/tools.js
node --test test/events.test.js   # one file
```

## The eval

`fixtures/` holds four deliberately messy threads, each planted with specific traps —
out-of-order messages, contradicting timestamps, an unreadable time, a retracted
figure, a guess at root cause, a named colleague, a joke, an unrelated incident.
`fixtures/README.md` has the trap-by-trap table. They are both the demo input and the
eval set, and they are also what the example buttons in the UI load, so the demo and
the eval can never drift apart.

```sh
npm run eval                 # all four fixtures through the real loop
npm run eval -- phishing     # one of them
```

`eval/traps.js` is the trap table as assertions: every claim in `fixtures/README.md`
that can be checked without a human, written as a pure function over the drafted
artefacts. `eval/run.js` drafts each fixture for real and reports which traps held,
with latency and token counts beside them. It exits non-zero on any failure, so a
prompt or model change that got dumber fails loudly instead of surviving three
commits.

Judgement is the product, so **re-run this after any change to the prompt, the model,
or `reasoning_effort`.** A faster setting that breaks a trap is not a faster setting.

The harness prints what it *cannot* check at the end of every run. Regexes catch the
phrasings they were written for; they do not catch a fluent rewording that means the
same thing. Treat a green run as "no known trap regressed", never as "the judgement
was good".

**Do not paste real incident threads into a third-party model endpoint.**
