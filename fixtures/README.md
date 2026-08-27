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

That last row is the one to watch. It is the difference between an app that reformats
and an app that exercises judgement, and it is the only trap in the set that a fluent,
confident, entirely wrong answer would sail straight through.
