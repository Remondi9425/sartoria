/**
 * The Fit Advisor, over HTTP.
 *
 * Asked for only when the customer taps "Why this size?". It receives the pair
 * and the handful of numbers the size depends on — waist, seat and inseam, with
 * how far each can be trusted and where they came from — and nothing else: no
 * video, no height, no ticket, no identifier. The calculator runs again here,
 * from those numbers, so the size the advisor explains is the calculator's and
 * not whatever a client claims.
 *
 * It needs ANTHROPIC_API_KEY, read server-side from the environment (e.g.
 * web/.env.local, never committed). There is no stand-in for the model.
 *
 * Nothing is kept. The numbers are not logged and not stored; they go to
 * Anthropic's API for the length of one explanation and are discarded. Without
 * a key the route says so, and the screen keeps its fixed sentences.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { productById } from "@/lib/catalog";
import type { Confidence, DigitalTwin } from "@/lib/engine/types";
import { runFitAdvisor, type CreateMessage } from "@/lib/fitAdvisor/agent";
import { METHODS } from "@/lib/fitAdvisor/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 12000;

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

const noStore = { "cache-control": "no-store" };

/** The same plausible envelope as `lib/engine/contract.ts`. */
const RANGE = { waist: [55, 160], hip: [70, 170], inseam: [55, 105] } as const;
const CONFIDENCES: Confidence[] = ["high", "medium", "low"];

/** Rebuilds the only parts of a twin the calculator reads. Null if malformed. */
function twinFrom(b: Record<string, unknown>): DigitalTwin | null {
  const num = (k: keyof typeof RANGE) => {
    const v = b[k];
    return typeof v === "number" && v >= RANGE[k][0] && v <= RANGE[k][1] ? v : null;
  };
  const conf = (b.confidence ?? {}) as Record<string, unknown>;
  const c = (k: string) => CONFIDENCES.includes(conf[k] as Confidence) ? conf[k] as Confidence : null;
  const waist = num("waist"), hip = num("hip"), inseam = num("inseam");
  const cw = c("waist"), ch = c("hip"), ci = c("inseam");
  const source = METHODS.find((m) => m === b.source);
  if (waist === null || hip === null || inseam === null || !cw || !ch || !ci || !source) return null;
  return {
    session_id: "advisor", height_cm: 0,
    measurements_cm: {
      waist, hip, inseam, thigh: 0, knee: 0, calf: 0, ankle: 0, outseam: 0, rise: 0,
    },
    measurement_confidence: {
      waist: cw, hip: ch, inseam: ci,
      thigh: "low", knee: "low", calf: "low", ankle: "low", outseam: "low", rise: "low",
    },
    measurement_notes: {},
    capture_quality: {
      head_visible: null, feet_visible: null, body_in_frame: null,
      usable_frames: 0, rotation_coverage: 0, frontal_yaw_deg: null, profile_yaw_deg: null,
    },
    processing_method: source,
    data_quality_tier: "B",
    created_at: new Date(0).toISOString(),
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "The fit advisor needs ANTHROPIC_API_KEY on the server." },
                             { status: 503, headers: noStore });
  }
  if (tooMany(req)) {
    return NextResponse.json({ error: "Too many requests at once." },
                             { status: 429, headers: noStore });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Too long." }, { status: 413, headers: noStore });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400, headers: noStore });
  }
  const product = typeof body.product_id === "string" ? productById(body.product_id) : undefined;
  const twin = twinFrom(body);
  if (!product || !twin) {
    return NextResponse.json({ error: "Nothing to explain." }, { status: 400, headers: noStore });
  }

  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const create: CreateMessage = (p) => client.beta.messages.create(p);
  try {
    const result = await runFitAdvisor(create, twin, product);
    if (!result.ok) {
      // Which check failed is not returned: the reason can quote the numbers.
      return NextResponse.json({ error: "The advisor's explanation did not check out." },
                               { status: 502, headers: noStore });
    }
    return NextResponse.json({ explanation: result.explanation, steps: result.steps },
                             { headers: noStore });
  } catch {
    // Deliberately not logged: the error could carry the customer's numbers.
    return NextResponse.json({ error: "The fit advisor could not be reached." },
                             { status: 502, headers: noStore });
  }
}
