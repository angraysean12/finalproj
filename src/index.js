import ui from "./ui.html";
import { runDraft } from "./loop.js";
import portalOutage from "../fixtures/portal-outage.txt";
import misSentLetters from "../fixtures/mis-sent-letters.txt";
import phishingCredentials from "../fixtures/phishing-credentials.txt";
import overnightPayments from "../fixtures/overnight-payments.txt";

const MAX_THREAD_CHARS = 20_000;

// The fixtures are the eval set; serving them is what stops the demo examples
// drifting from the threads the traps are actually checked against. `note` is
// the trap the thread is there to demonstrate, not a summary of the incident.
const EXAMPLES = [
  {
    id: "portal-outage",
    label: "Portal outage",
    note: "Out of order, one unreadable time",
    thread: portalOutage,
  },
  {
    id: "mis-sent-letters",
    label: "Mis-sent letters",
    note: "A named colleague, a count nobody has",
    thread: misSentLetters,
  },
  {
    id: "phishing-credentials",
    label: "Phishing",
    note: "A retracted figure, a reporter waiting",
    thread: phishingCredentials,
  },
  {
    id: "overnight-payments",
    label: "Overnight payments",
    note: "59 lines, a recovery that did not hold",
    thread: overnightPayments,
  },
];

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/") {
      return new Response(ui, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "GET" && pathname === "/examples") {
      return json(EXAMPLES);
    }

    if (request.method === "POST" && pathname === "/draft") {
      return handleDraft(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleDraft(request, env) {
  if (!env.OPENCODE_API_KEY) {
    return json({ error: "OPENCODE_API_KEY is not set on this deployment" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const { thread } = body;
  if (typeof thread !== "string" || thread.trim() === "") {
    return json({ error: "thread is required" }, 400);
  }
  if (thread.length > MAX_THREAD_CHARS) {
    return json({ error: `thread must be under ${MAX_THREAD_CHARS} characters` }, 400);
  }

  try {
    return json(await runDraft(thread, env));
  } catch (err) {
    console.error("draft failed:", err);
    return json({ error: "Could not draft from that thread. Try again." }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
