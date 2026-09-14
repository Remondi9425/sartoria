"use client";

import { LegDiagram } from "@/components/art/LegDiagram";
import { Body, Button, Eyebrow, Footer, Note, Screen, StubBadge, Title } from "@/components/ui";
import type { DigitalTwin } from "@/lib/engine/types";

const TIER_NOTE: Record<string, string> = {
  A: "Every measurement came out clean.",
  B: "Good enough to pick a size. A couple of the smaller numbers are softer.",
  C: "Usable, but we would rather you confirmed the waist yourself.",
};

export function Measurements({
  twin, seconds, onNext,
}: { twin: DigitalTwin; seconds: number; onNext: () => void }) {
  // The contract carries its own provenance, so no screen needs a flag that
  // somebody could forget to flip when the real engine lands.
  const stub = twin.processing_method.startsWith("stub");
  return (
    <Screen>
      <Body>
        <Eyebrow>Done — {seconds} seconds</Eyebrow>
        <Title>These are your numbers.</Title>

        {stub && (
          <div className="pt-4">
            <StubBadge />
            <p className="pt-2.5 text-[12px] leading-[1.5] text-mute">
              Nothing was measured — the video was never looked at. Fixed
              values, so the flow can be walked through before the measurement
              engine exists.
            </p>
          </div>
        )}

        <div className="pt-6">
          <LegDiagram twin={twin} />
        </div>

        <div className="rounded-xl bg-paper px-4 py-3">
          <p className="text-[12px] leading-[1.5] text-mute">
            <span className="font-semibold text-ink">
              Quality {twin.data_quality_tier}.
            </span>{" "}
            {TIER_NOTE[twin.data_quality_tier]}
          </p>
        </div>

        <div className="pt-4 pb-2">
          <Note>
            Saved to your profile. Yours to see, export or delete at any time.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button onClick={onNext}>Show me jeans that fit</Button>
      </Footer>
    </Screen>
  );
}
