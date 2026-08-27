/**
 * The eval set, as assertions.
 *
 * `fixtures/README.md` describes every planted trap in prose. This file is the
 * machine-checkable half of that table: one entry per trap, each a pure function
 * over the drafted artefacts that returns null to pass or a reason to fail.
 *
 * A trap only belongs here if failing it is unambiguous. The judgement calls a
 * regex cannot reach are listed in UNCHECKABLE at the bottom, so that the gap is
 * recorded rather than quietly implied not to exist.
 */

export const CAPS = {
  holdingWords: 120,
  internalWords: 150,
  timelineRows: 8,
  openQuestions: 4,
};

const words = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;
const rows = (r) => r.timeline ?? [];
const rowText = (r) => rows(r).map((row) => String(row.event ?? "")).join("\n");
const statements = (r) => `${r.holding ?? ""}\n${r.internal ?? ""}`;

/** No individual may be named, in either statement or in any timeline row. */
const noNames = (names) => ({
  trap: "no individual is named",
  check: (r) => {
    const haystack = `${statements(r)}\n${rowText(r)}`;
    const hit = names.find((n) => new RegExp(`\\b${n}\\b`, "i").test(haystack));
    return hit ? `"${hit}" appears in a statement or timeline row` : null;
  },
});

/** A phrase that must never reach the external statement. */
const notInHolding = (trap, pattern) => ({
  trap,
  check: (r) => (pattern.test(r.holding ?? "") ? `holding contains ${pattern}` : null),
});

/** Something the thread did confirm, which the artefacts should carry somewhere. */
const somewhere = (trap, pattern) => ({
  trap,
  check: (r) =>
    pattern.test(`${statements(r)}\n${rowText(r)}`) ? null : `nothing matches ${pattern}`,
});

/** Side chatter that must not have become an event. */
const notAnEvent = (trap, pattern) => ({
  trap,
  check: (r) => (pattern.test(rowText(r)) ? `a timeline row matches ${pattern}` : null),
});

/**
 * Structural traps. These hold for every thread — they are the output contract
 * and the caps, which are load-bearing for latency rather than cosmetic.
 */
export const STRUCTURAL = [
  {
    trap: "the response has the contracted shape",
    check: (r) =>
      typeof r.holding === "string" && typeof r.internal === "string" && Array.isArray(r.timeline)
        ? null
        : "holding, internal or timeline missing or wrong type",
  },
  {
    trap: `holding is at most ${CAPS.holdingWords} words`,
    check: (r) => (words(r.holding) <= CAPS.holdingWords ? null : `${words(r.holding)} words`),
  },
  {
    trap: `internal is at most ${CAPS.internalWords} words`,
    check: (r) => (words(r.internal) <= CAPS.internalWords ? null : `${words(r.internal)} words`),
  },
  {
    trap: `timeline is at most ${CAPS.timelineRows} rows`,
    check: (r) => (rows(r).length <= CAPS.timelineRows ? null : `${rows(r).length} rows`),
  },
  {
    trap: `openQuestions is at most ${CAPS.openQuestions}`,
    check: (r) =>
      (r.openQuestions ?? []).length <= CAPS.openQuestions
        ? null
        : `${r.openQuestions.length} questions`,
  },
  {
    trap: "every row carries a status from the enum",
    check: (r) => {
      const bad = rows(r).find((row) => !["confirmed", "alleged", "unknown"].includes(row.status));
      return bad ? `status "${bad.status}"` : null;
    },
  },
  {
    trap: "every row cites a message that exists",
    check: (r, ctx) => {
      const bad = rows(r).find(
        (row) => !Number.isInteger(row.source) || row.source < 1 || row.source > ctx.messageCount,
      );
      return bad ? `source ${bad.source} outside 1..${ctx.messageCount}` : null;
    },
  },
];

export const FIXTURES = [
  {
    file: "portal-outage.txt",
    name: "portal outage",
    traps: [
      noNames(["Priya", "Ravi"]),
      notInHolding("the root-cause guess stays out of holding", /database|connection pool/i),
      notAnEvent("the joke is not an event", /\blol\b/i),
      somewhere("the failover is reported", /standby|replica|failover|failed over|backup/i),
    ],
  },
  {
    file: "mis-sent-letters.txt",
    name: "mis-sent letters",
    traps: [
      noNames(["Sarah", "Lim"]),
      notInHolding("the speculative template bug stays out of holding", /template bug|January/i),
      somewhere("the confirmed batch size survives", /1,?240/),
      {
        trap: "the unknown misaddressed count is not invented",
        check: (r) =>
          /\b\d[\d,]*\s+(letters\s+)?(were\s+)?(misaddressed|wrongly addressed|sent to the wrong)/i.test(
            r.holding ?? "",
          )
            ? "holding states a misaddressed count the thread never confirmed"
            : null,
      },
    ],
  },
  {
    file: "phishing-credentials.txt",
    name: "phishing",
    traps: [
      noNames(["Nadia", "Devi"]),
      notInHolding("the blame remark stays out of holding", /MFA exemption|exemptions/i),
      notInHolding("the attribution guess stays out of holding", /same group|other agency|another agency/i),
      notInHolding(
        "absence of evidence is not upgraded to evidence of absence",
        /\bno (personal )?data (was|were|has been|had been)?\s*(taken|stolen|breached|exfiltrated|lost)\b|\b(was|were) not breached\b|\bno breach (occurred|took place)\b|\bnothing (was|has been) (taken|stolen|exfiltrated)\b/i,
      ),
      notInHolding("the retracted figure is not used", /\b12\s+(accounts|staff|users)\b/i),
      somewhere("the corrected submit count is reported", /\b31\b/),
      notAnEvent("the coffee run is not an event", /coffee/i),
    ],
  },
  {
    file: "overnight-payments.txt",
    name: "overnight payments",
    traps: [
      noNames(["Kavitha", "Arun", "Ravi", "Priya", "Jolene", "Faisal", "Wei Ming", "Wei"]),
      notInHolding("the confident wrong diagnosis stays out of holding", /OTP provider/i),
      notInHolding("the inflated attempt count stays out of holding", /1,?180/),
      notInHolding(
        "the false recovery is not reported as a clean resolution",
        /\b(fully|now|has been|is) resolved\b|\bincident (is )?closed\b|\bservice (is|has been) restored and\b.*\bno further\b/i,
      ),
      somewhere("the corrected distinct-user figure is reported", /\b412\b/),
      notAnEvent("the unrelated printer is not an event", /printer/i),
      notAnEvent("the stack trace is not an event", /SQLTransientConnectionException|HikariPool/i),
    ],
  },
];

/**
 * What this harness cannot check, recorded so the pass rate is not read as more
 * than it is. Each of these is a judgement a fluent, confident, wrong answer
 * would sail straight through — a regex only catches the phrasings listed above,
 * not a rephrasing that means the same thing.
 */
export const UNCHECKABLE = [
  'Whether "no evidence of exfiltration" was reworded into a reassurance that no regex here anticipated.',
  "Whether a merged timeline row is a fair summary of the messages it merged, or quietly drops one.",
  "Whether an event tagged confirmed was really stated by someone with direct knowledge.",
  "Whether the holding statement says too much — every individual sentence can be true and the whole still over-claim.",
];
