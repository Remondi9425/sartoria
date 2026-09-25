/**
 * The tailor, reading one typed answer.
 *
 * The only place a model is involved, and the only thing it is given: the
 * question on screen, the chips beside it, and the words the customer typed.
 * No measurements, no size, no earlier answers. It returns which chip the
 * words mean (if any), a short label for the ticket, and one line of reply.
 *
 * It cannot change a size — nothing here reaches the calculator — and it
 * cannot change the order on its own: a label that matches no chip becomes a
 * note on the ticket with no ranking effect. See `lib/preferences.ts`.
 *
 * Nothing is kept. The text is not logged and not stored; it is discarded as
 * soon as the response is sent. Without a key the route says so, and the
 * screen falls back to writing the words on the ticket as they are.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const MAX_TEXT = 280;
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;

// Per-instance, reset by every cold start — like the other routes. It blunts
// a loop from one address; it is not a quota.
const seen = new Map<string, number[]>();

function tooMany(req: NextRequest): boolean {
  const id = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (seen.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  const over = recent.length >= LIMIT;
  if (!over) recent.push(now);
  seen.set(id, recent);
  return over;
}

export interface TailorReading {
  option: string | null;
  need: string;
  reply: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    option: { type: ["string", "null"] },
    need: { type: "string" },
    reply: { type: "string" },
  },
  required: ["option", "need", "reply"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You help a customer choose jeans. Their size is already decided from body " +
  "measurements; you only note needs that reorder suggestions. You are given one " +
  "question, its answer options, and what the customer wrote. Reply in JSON: " +
  "`option` is one of the options copied exactly if the customer's words mean it, " +
  "otherwise null; `need` is a 2–4 word label for their need, as it would be " +
  "written on a fitting ticket; `reply` is one short, warm sentence acknowledging " +
  "it, with no question. Never mention a size.";

const noStore = { "cache-control": "no-store" };

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The tailor is offline in this demo." },
                             { status: 503, headers: noStore });
  }
  if (tooMany(req)) {
    return NextResponse.json({ error: "Too many answers at once." },
                             { status: 429, headers: noStore });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Too long." }, { status: 413, headers: noStore });
  }
  let body: { question?: unknown; options?: unknown; text?: unknown };
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400, headers: noStore });
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 200) : "";
  const options = Array.isArray(body.options)
    ? body.options.filter((o): o is string => typeof o === "string").slice(0, 8)
      .map((o) => o.slice(0, 80))
    : [];
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!question || !text) {
    return NextResponse.json({ error: "Nothing to read." }, { status: 400, headers: noStore });
  }

  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  try {
    const msg = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{
        role: "user",
        content:
          `Question: ${JSON.stringify(question)}\n` +
          `Options: ${options.map((o) => JSON.stringify(o)).join(", ")}\n` +
          `Customer wrote: ${JSON.stringify(text)}`,
      }],
    });
    if (msg.stop_reason === "refusal") throw new Error("refused");
    const out = msg.content.find((b) => b.type === "text");
    const parsed = JSON.parse(out && "text" in out ? out.text : "") as TailorReading;
    const option = options.find((o) => o.toLowerCase() === String(parsed.option).toLowerCase())
      ?? null;
    const reading: TailorReading = {
      option,
      need: String(parsed.need ?? "").slice(0, 40),
      reply: String(parsed.reply ?? "").slice(0, 200),
    };
    return NextResponse.json(reading, { headers: noStore });
  } catch {
    // Deliberately not logged: the error could carry the customer's words.
    return NextResponse.json({ error: "The tailor could not read that." },
                             { status: 502, headers: noStore });
  }
}
