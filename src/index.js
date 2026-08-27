import ui from "./ui.html";
import { runDraft } from "./loop.js";

const MAX_THREAD_CHARS = 20_000;

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/") {
      return new Response(ui, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
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
