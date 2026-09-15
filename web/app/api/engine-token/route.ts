/**
 * Mints a short-lived token for the measurement engine.
 *
 * What this achieves, precisely: it stops someone who finds the engine's URL
 * from spending GPU time on it, and it ties the token to the address that
 * asked, so one lifted from a browser is no use elsewhere.
 *
 * What it does not achieve: authorising a person. This route hands a token to
 * anybody who asks, so whoever finds the app can still get one. That needs a
 * bot check or a signed-in session, and issuance limits that outlive a single
 * serverless instance. The limit below is per-instance and resets on every
 * cold start — it blunts a loop from one address, not a determined caller.
 */
import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 900;
const ISSUE_LIMIT = 20;
const ISSUE_WINDOW_MS = 10 * 60 * 1000;

const issued = new Map<string, number[]>();

function b64url(raw: Buffer | string): string {
  return Buffer.from(raw).toString("base64url");
}

/** Matches spike/auth.py caller_id exactly, including the key.
 *
 *  Keyed rather than a bare digest: there are four billion IPv4 addresses, so
 *  a plain hash of one is reversible by trying them all. The address itself is
 *  never put in the token — that travels through a browser. */
function callerId(address: string | null, secret: string): string {
  return createHmac("sha256", secret).update(address || "unknown")
    .digest("hex").slice(0, 16);
}

function tooMany(who: string): boolean {
  const now = Date.now();
  const hits = (issued.get(who) ?? []).filter((t) => now - t < ISSUE_WINDOW_MS);
  if (hits.length >= ISSUE_LIMIT) {
    issued.set(who, hits);
    return true;
  }
  hits.push(now);
  issued.set(who, hits);
  return false;
}

export async function POST(request: NextRequest) {
  const secret = process.env.SARTORIA_TOKEN_SECRET;
  if (!secret) {
    // Unset is the local-development case, and the worker treats it the same
    // way: open. Saying so plainly beats handing back a token that means
    // nothing.
    return NextResponse.json({ token: null, open: true });
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
                  ?? null;
  const who = callerId(address, secret);
  if (tooMany(who)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    p: "measure",
    w: who,
  });
  const body = b64url(payload);
  const sig = createHmac("sha256", secret).update(body).digest();

  return NextResponse.json({ token: `${body}.${b64url(sig)}`, open: false },
                           { headers: { "cache-control": "no-store" } });
}
