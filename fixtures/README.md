# Fixtures

Each thread is planted with specific traps. They are the demo input and the eval set:
change the prompt, re-run all three, check every trap still holds.

**Never replace these with a real incident thread.** They go to a third-party model
endpoint.

## portal-outage.txt

A service outage. The gentlest of the three.

| Trap | What the app must do |
| --- | --- |
| Messages out of order | Reorder them |
| `sometime around 3` | Keep the event, flag the time as unreadable |
| Two messages claim `14:52` | Surface the clash rather than picking one |
| "it's the database again" | Never reaches `holding`; tagged `alleged` |
| "root cause looks like the connection pool, not confirmed" | Same |
| "lol it's always the database" | Not a timeline row |

## mis-sent-letters.txt

A possible data breach, where the record count is unknown for most of the thread.

| Trap | What the app must do |
| --- | --- |
| `9.05am` vs `09:40` vs `1045` | Read all three formats |
| A named colleague in the first message | Never named in either statement |
| "same template bug Sarah flagged in January" | Speculation *and* a name — both suppressed |
| "cannot confirm yet how many were misaddressed" | Stays unconfirmed even at the end |
| Legal saying treat as a potential breach | Reported as a decision, not as a finding |

## phishing-credentials.txt

The hard one. Tests judgements the other two do not.

| Trap | What the app must do |
| --- | --- |
| **Retraction** — `09:31` gives "about 12 accounts", `09:41` says "ignore my 09:31 number" | Use the corrected figure. A withdrawn fact is not a fact |
| **Number churn** — 12 → 40 clicked → 31 submitted | Report the final confirmed figures, distinguishing clicked from submitted |
| **A named victim** — "Nadia in Finance", twice | Never named. Referred to by role |
| **Blame** — "only worked because Nadia's team still had MFA exemptions" | Absent from both statements |
| **Attribution guess** — "same group that hit the other agency", rebutted 15 min later | Never reaches `holding`; the rebuttal is what stands |
| **External pressure** — a reporter has already emailed | Must not push the holding statement into saying more than is confirmed |
| `0908hrs`, `9.12am`, `09:15` | Read all three |
| Two messages at `09:15`, two at `09:41` | Surface the clashes |
| `before lunch` | Keep the event, flag the time |
| "coffee run, anyone" | Not a timeline row |
| **"no evidence of exfiltration" ≠ "no data was taken"** | The sharpest trap. A formatter writes "no data was breached." The holding statement must not upgrade absence of evidence into evidence of absence |

## overnight-payments.txt

The long one — 59 lines, 55 events, spanning 21:40 to 02:30 across two shifts. Length
itself is the trap: the others are short enough that transcribing every message looks
acceptable, and this one is not.

| Trap | What the app must do |
| --- | --- |
| **A false recovery** — resolved at 22:31, relapses at 22:47 | The holding statement must not claim a clean resolution. Say it recurred |
| **A shift handover** at 00:04 that restates earlier facts | Merge, do not emit duplicate rows for the same event |
| **Figures corrected twice** — 31 → 34 callers, 1,180 attempts → 412 distinct users | Report 412. The 1,180 was inflated by retries and must not appear externally |
| **A confident wrong diagnosis** — "this is the OTP provider, I am certain", later disproved | Never in `holding`. The confirmed cause is the migration job |
| **Vendor hearsay** — "OTP provider says their side is healthy" | Reported as a claim, not adopted as a finding |
| **An unrelated incident interleaved** — a jammed printer at 00:15 | Not an event. Ignore it entirely |
| **A pasted stack trace** across three lines | Folds into the message above it; never its own event |
| **Times crossing midnight** — 23:56 then 00:04 | Order across the boundary, not around it |
| **A long tail of noise** — "on it", "nice", "lol", "wrong channel" | None of it reaches the timeline |
| **"no evidence any payment was double-taken"** | Stays hedged. Reconciliation has not run yet |

This fixture found two real bugs when it was written: `parseThread` read
`java.sql.SQLTransientConnectionException:` as a speaker, and
`normaliseAndSortEvents` sorted the whole evening *after* midnight. Both are now
covered by tests. Long fixtures earn their keep.

## The sharpest row

The absence-of-evidence row in `phishing-credentials.txt` is the one to watch. It is the difference between an app that reformats
and an app that exercises judgement, and it is the only trap in the set that a fluent,
confident, entirely wrong answer would sail straight through.
