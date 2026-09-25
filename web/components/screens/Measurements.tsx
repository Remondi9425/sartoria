"use client";

import { CHALK, PointCloud } from "@/components/art/PointCloud";
import { LegScan } from "@/components/art/LegScan";
import { legsCloud } from "@/components/art/bodyCloud";
import {
  Body, Button, CornerLogo, Eyebrow, Footer, Note, Screen, SpeakingBars, StubBadge, Title,
} from "@/components/ui";
import type { DigitalTwin } from "@/lib/engine/types";

/**
 * What the tier can honestly claim.
 *
 * It says how well this video agreed with itself, which is the only evidence
 * the pipeline has: there is no tape measure inside it. Whether that agreement
 * means the numbers are *right* is a separate question, and the answer so far
 * is one person — `scripts/evaluate.py` refuses to give a verdict below five.
 *
 * "Good enough to pick a size" was a claim about accuracy made from a
 * consistency check.
 */
const TIER_NOTE: Record<string, string> = {
  A: "The waist, seat and leg lengths came out the same in every frame.",
  B: "Consistent across this video, with a couple of the smaller numbers softer.",
  C: "The frames disagreed enough that we would rather you checked one of "
     + "these yourself.",
};

/** Which measurements the frames actually disagreed on.
 *
 *  Tier C used to send everyone to check their waist, whichever number was
 *  the soft one — so a reader whose waist was fine learned nothing and
 *  trusted the tier a little less. */
function shaky(twin: DigitalTwin): string[] {
  return Object.entries(twin.measurement_confidence)
    .filter(([, c]) => c === "low")
    .map(([site]) => site);
}

export function Measurements({
  twin, seconds, onNext, onSkip,
}: { twin: DigitalTwin; seconds: number; onNext: () => void; onSkip: () => void }) {
  // The contract carries its own provenance, so no screen needs a flag that
  // somebody could forget to flip when the real engine lands.
  const stub = twin.processing_method.startsWith("stub");
  const own = !!twin.leg_cloud_cm?.length;
  return (
    <Screen>
      <CornerLogo />
      <Body>
        <Eyebrow>Done — {seconds} seconds</Eyebrow>
        <Title>These are your <em>numbers.</em></Title>

        {stub && (
          <div className="flex flex-col items-start gap-2 pt-3.5">
            <StubBadge />
            <p className="text-[12px] leading-[1.5] text-mute">
              Nothing was measured — the video was never looked at. Fixed
              values, so the flow can be walked through before the measurement
              engine exists.
            </p>
          </div>
        )}

        {/* The scan when there is one. Without one, the same legs that formed
            while waiting stand in — and say so, because a generic figure next
            to the customer's numbers could be read as their own. */}
        <div className="relative mt-4 h-[250px] rounded-[18px] border border-chalk/6 bg-surface">
          {own ? (
            <LegScan points={twin.leg_cloud_cm!} className="absolute inset-x-0 inset-y-3 h-[226px] w-full" />
          ) : (
            <PointCloud points={legsCloud()} tint={CHALK} turnSeconds={30}
                        className="absolute inset-x-0 inset-y-3 h-[226px] w-full" />
          )}
        </div>
        <p className="pt-2 text-center text-[11px] text-faint">
          {own ? "Your legs, as measured · drag to turn"
               : "A stand-in figure — not your legs"}
        </p>

        <div className="grid grid-cols-4 gap-2 pt-2.5">
          {(["waist", "hip", "thigh", "inseam"] as const).map((site) => (
            <div key={site} className="rounded-[10px] bg-surface px-1 py-2.5 text-center">
              <p className="figure text-[16px] font-semibold leading-none">
                {twin.measurements_cm[site]}
              </p>
              <p className="figure pt-[5px] text-[8.5px] font-medium uppercase tracking-[.12em] text-faint">
                {site}
              </p>
            </div>
          ))}
        </div>

        <p className="pt-3 text-[12px] leading-[1.5] text-mute">
          <span className="font-semibold text-chalk">
            Consistency {twin.data_quality_tier}.
          </span>{" "}
          {TIER_NOTE[twin.data_quality_tier]}{" "}
          {twin.data_quality_tier === "C" && shaky(twin).length > 0 && (
            <span className="text-chalk">
              Softest here: {shaky(twin).join(", ")}.{" "}
            </span>
          )}
          How close any of this is to a tape measure is still being
          established.
        </p>

        <div className="mt-[18px] mb-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SpeakingBars />
            <span className="figure text-[9.5px] font-medium tracking-[.16em] text-amber uppercase">
              Tailor
            </span>
          </div>
          <div className="rounded-[18px_18px_18px_4px] bg-surface px-[15px] py-3 text-[14px] leading-[1.45]">
            These numbers settle your size. Now tell me how you wear jeans. It
            changes the order I show them in, never the size.
          </div>
        </div>

        <div className="pt-2 pb-2">
          <Note>
            Nothing is stored yet — close this and the numbers are gone. When a
            profile exists it will be yours to see, export and delete.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button onClick={onNext}>Talk it through · 5 questions</Button>
        <div className="pt-2.5 text-center">
          <Button variant="ghost" onClick={onSkip}>Skip — just show me everything</Button>
        </div>
      </Footer>
    </Screen>
  );
}
