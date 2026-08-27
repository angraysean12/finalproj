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
  round 1  model extracts messages, calls normalise_and_sort_events
  round 2  model drafts from the sorted events, calls emit_incident_comms
  → that call's arguments are the response
```

Two tools:

| Tool | What it does |
| --- | --- |
| `normalise_and_sort_events` | Orders extracted messages by time; flags unreadable timestamps and clashes. Pure, and the only tested logic. |
| `emit_incident_comms` | Definition only. Its schema **is** the response contract. |

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

`fixtures/` holds two deliberately messy threads, each planted with a specific trap —
out-of-order messages, contradicting timestamps, an unreadable time, a guess at root
cause, a named colleague, a joke. They are the demo input and the eval set. Run each
through the UI and check:

- the guessed root cause does **not** appear in `holding`
- no individual is named in **either** statement
- the joke is not a timeline row
- messages come back in chronological order
- the timestamp clash is surfaced, not silently resolved

**Do not paste real incident threads into a third-party model endpoint.**
