/**
 * Tool definitions and implementations for Incident Comms.
 *
 * Each tool is split in two: an entry point that the model calls, and a pure
 * function that does the work. The pure functions are the ones covered by tests.
 *
 * `emit_incident_comms` is deliberately implementation-free. Its schema *is* the
 * output contract, and `loop.js` treats a call to it as the end of the run.
 */

export const STATUSES = ["confirmed", "alleged", "unknown"];

// ---------------------------------------------------------------------------
// Definitions sent to the model
// ---------------------------------------------------------------------------

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "normalise_and_sort_events",
      description:
        "Put extracted thread events in chronological order and flag any timestamp " +
        "that cannot be read or that contradicts another. Call this BEFORE drafting.",
      parameters: {
        type: "object",
        properties: {
          events: {
            type: "array",
            description: "Every message you extracted from the thread, in the order it appeared.",
            items: {
              type: "object",
              properties: {
                time: {
                  type: "string",
                  description: 'The timestamp as written in the thread, e.g. "14:32", "2.40pm", "0645Z".',
                },
                speaker: { type: "string", description: "Who sent it, as written." },
                text: { type: "string", description: "What the message said." },
              },
              required: ["time", "speaker", "text"],
            },
          },
        },
        required: ["events"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "emit_incident_comms",
      description:
        "Deliver the finished artefacts. Call this exactly once, as your final action.",
      parameters: {
        type: "object",
        properties: {
          holding: {
            type: "string",
            description:
              "External holding statement. Confirmed facts only. No names, no cause, no blame.",
          },
          internal: {
            type: "string",
            description:
              "Internal update for colleagues. May include what is still unconfirmed, marked as such.",
          },
          timeline: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string", description: "Normalised timestamp." },
                event: { type: "string", description: "What happened, one line." },
                status: {
                  type: "string",
                  enum: STATUSES,
                  description: "confirmed = stated as fact by someone with direct knowledge; " +
                    "alleged = claimed or speculated; unknown = referenced but unverified.",
                },
                source: {
                  type: "integer",
                  description: "1-based position of the thread message this came from.",
                },
              },
              required: ["time", "event", "status", "source"],
            },
          },
          openQuestions: {
            type: "array",
            items: { type: "string" },
            description: "What the thread does not resolve. May be empty.",
          },
        },
        required: ["holding", "internal", "timeline"],
      },
    },
  },
];

export async function executeTool(name, args) {
  switch (name) {
    case "normalise_and_sort_events":
      return JSON.stringify(normaliseAndSortEvents(args.events ?? []));
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ---------------------------------------------------------------------------
// normalise_and_sort_events
// ---------------------------------------------------------------------------

/**
 * Read a timestamp as written in a chat thread and return minutes since
 * midnight, or null if it cannot be read.
 *
 * Handles 24-hour ("14:32", "1432"), 12-hour ("2:32pm", "2.32 PM") and a
 * trailing zone marker ("0645Z", "14:32 SGT"), which is ignored rather than
 * applied: the thread's own zone is unknowable from the text alone.
 */
export function parseClock(raw) {
  if (typeof raw !== "string") return null;

  const cleaned = raw.trim().toLowerCase();
  const meridiem = /(^|[^a-z])([ap])\.?m\.?([^a-z]|$)/.exec(cleaned)?.[2] ?? null;
  const digits = /(\d{1,2})\s*[:.h]?\s*(\d{2})/.exec(cleaned);
  if (!digits) return null;

  let hours = Number(digits[1]);
  const minutes = Number(digits[2]);
  if (minutes > 59) return null;

  if (meridiem === "p" && hours < 12) hours += 12;
  if (meridiem === "a" && hours === 12) hours = 0;
  if (hours > 23) return null;

  return hours * 60 + minutes;
}

/** Render minutes since midnight back as a 24-hour clock. */
export function formatClock(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Order thread events by their timestamps and report what looked wrong.
 *
 * Pure. Never drops an event: an unreadable timestamp is kept in its original
 * position and flagged, because a missing message is worse than an unsorted one.
 *
 * Notes are advisory. They exist so the model can say "the thread disagrees
 * about when this happened" instead of silently picking one reading.
 */
export function normaliseAndSortEvents(rawEvents) {
  const events = rawEvents.map((event, i) => ({
    source: i + 1,
    speaker: String(event?.speaker ?? "unknown"),
    text: String(event?.text ?? ""),
    written: String(event?.time ?? ""),
    minutes: parseClock(event?.time),
  }));

  const notes = [];

  const unreadable = events.filter((e) => e.minutes === null);
  for (const e of unreadable) {
    notes.push(
      `Message ${e.source} has no readable timestamp ("${e.written}"); left in thread order.`,
    );
  }

  const dated = events.filter((e) => e.minutes !== null);

  const seen = new Map();
  for (const e of dated) {
    const key = e.minutes;
    if (seen.has(key)) {
      notes.push(
        `Messages ${seen.get(key)} and ${e.source} both claim ${formatClock(key)}; ` +
          `the thread does not say which came first.`,
      );
    } else {
      seen.set(key, e.source);
    }
  }

  const reordered = dated.some((e, i, arr) => i > 0 && arr[i - 1].minutes > e.minutes);
  if (reordered) {
    notes.push("The thread is not in chronological order; it has been reordered.");
  }

  // Stable sort by time, undated events keeping their original slot at the end.
  const sorted = [
    ...dated.sort((a, b) => a.minutes - b.minutes || a.source - b.source),
    ...unreadable,
  ].map((e) => ({
    time: e.minutes === null ? e.written : formatClock(e.minutes),
    speaker: e.speaker,
    text: e.text,
    source: e.source,
    time_readable: e.minutes !== null,
  }));

  return { events: sorted, notes };
}
