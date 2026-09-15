/**
 * Mints a short-lived token for the measurement engine.
 *
 * The engine's URL is public — anything NEXT_PUBLIC_ ends up in the bundle —
 * and hitting it starts a GPU container. The secret that signs this token is
 * not public: it lives only here, on the server, and in the worker.
 *
 * Deliberately small. It bounds who can spend GPU time; it is not a login.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 900;

function b64url(raw: Buffer | string): string {
  return Buffer.from(raw).toString("base64url");
}

export async function POST() {
  const secret = process.env.SARTORIA_TOKEN_SECRET;
  if (!secret) {
    // Unset is the local-development case, and the worker treats it the same
    // way: open. Saying so plainly beats handing back a token that means
    // nothing.
    return NextResponse.json({ token: null, open: true });
  }

  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    p: "measure",
  });
  const body = b64url(payload);
  const sig = createHmac("sha256", secret).update(body).digest();

  return NextResponse.json({ token: `${body}.${b64url(sig)}`, open: false },
                           { headers: { "cache-control": "no-store" } });
}

// Referenced so the import is not dropped; the comparison itself lives in the
// worker, which is the side that must not leak timing.
void timingSafeEqual;
