"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frame } from "@/components/Frame";
import { Choosing } from "@/components/screens/Choosing";
import { Checkout } from "@/components/screens/Checkout";
import { Feedback } from "@/components/screens/Feedback";
import { Filming } from "@/components/screens/Filming";
import { ManualEntry, NoVideoSwitch } from "@/components/screens/ManualEntry";
import { Measurements } from "@/components/screens/Measurements";
import { Product as ProductScreen } from "@/components/screens/Product";
import { Rejected } from "@/components/screens/Rejected";
import { EMPTY_TICKET, Tailor, needsOf, type Ticket } from "@/components/screens/Tailor";
import { LAND_MS, NeedleFlight, SWAP_MS, type Flight } from "@/components/NeedleFlight";
import { Wardrobe } from "@/components/screens/Wardrobe";
import { Welcome } from "@/components/screens/Welcome";
import { calculator, getEngine, type Scenario } from "@/lib/engine";
import { twinFromManual } from "@/lib/engine/manual";
import { twinFromOwnedPair } from "@/lib/engine/wardrobe";
import type { BrandChart } from "@/lib/brands";
import type {
  CaptureProgress, CaptureRejected, DigitalTwin, Product,
} from "@/lib/engine/types";

type Step =
  | "welcome" | "manual" | "owned" | "filming" | "analysing" | "rejected" | "wardrobe"
  | "measurements" | "tailor" | "choosing" | "product" | "checkout"
  | "feedback";

/** ?demo=no-head, ?demo=no-turn, ?demo=unsure — so the refusal paths can be
 *  shown on demand instead of described. */
function scenarioFromUrl(): Scenario {
  if (typeof window === "undefined") return "ok";
  const s = new URLSearchParams(window.location.search).get("demo");
  return s === "no-head" || s === "no-turn" || s === "unsure" ? s : "ok";
}

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [height, setHeight] = useState(174);
  const [twin, setTwin] = useState<DigitalTwin | null>(null);
  const [rejection, setRejection] = useState<CaptureRejected | null>(null);
  const [progress, setProgress] = useState<CaptureProgress>({ fraction: 0, hint: "" });
  const [elapsed, setElapsed] = useState(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [colourId, setColourId] = useState<string>("");
  // The fitting ticket never leaves this component, except a typed answer on
  // its way to be read (see app/api/tailor). It is not stored anywhere.
  const [ticket, setTicket] = useState<Ticket>(EMPTY_TICKET);
  const needs = useMemo(() => needsOf(ticket), [ticket]);
  const abort = useRef<AbortController | null>(null);
  const [engineIsStub, setEngineIsStub] = useState(true);

  // The needle transition: pulled from the wordmark's button, landing where
  // the corner logo will be drawn.
  const phone = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLSpanElement>(null);
  const [flight, setFlight] = useState<(Flight & { id: number }) | null>(null);
  const timers = useRef<number[]>([]);
  const flying = useRef(false);

  useEffect(() => () => {
    abort.current?.abort();
    timers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const fly = useCallback((veil: string, go: () => void) => {
    const ph = phone.current, b = button.current;
    if (flying.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ph || !b || still) return go();
    const pr = ph.getBoundingClientRect(), br = b.getBoundingClientRect();
    // The corner logo: 34 px, 24 px in from the top right.
    setFlight({
      id: Date.now(), width: pr.width, height: pr.height, size: 34, veil,
      from: { x: br.left + br.width / 2 - pr.left, y: br.top + br.height / 2 - pr.top },
      to: { x: pr.width - 24 - 17, y: 24 + 17 },
    });
    flying.current = true;
    timers.current.push(window.setTimeout(go, SWAP_MS),
                        window.setTimeout(() => { flying.current = false; setFlight(null); },
                                          LAND_MS));
  }, []);

  const start = useCallback((heightCm: number) => {
    setHeight(heightCm);
    setStep("filming");
    setProgress({ fraction: 0, hint: "" });
    setEngineIsStub(getEngine(scenarioFromUrl()).isStub);
  }, []);

  // Handed the recorded clip when the ten seconds are up. Only now does any
  // measuring start — before this there was nothing to measure.
  const analyse = useCallback(async (clip: Blob | null, heightCm = height) => {
    setStep("analysing");
    setProgress({ fraction: 0, hint: "Sending your clip" });

    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const began = Date.now();

    try {
      const engine = getEngine(scenarioFromUrl());
      setEngineIsStub(engine.isStub);
      const result = await engine.analyse({
        heightCm,
        video: clip ?? undefined,
        onProgress: setProgress,
        signal: ctrl.signal,
      });
      setElapsed(Math.max(1, Math.round((Date.now() - began) / 1000)));
      if (result.status === "ok") {
        setTwin(result.twin);
        setStep("measurements");
      } else {
        setRejection(result);
        setStep("rejected");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") throw e;
    }
  }, [height]);

  // No camera, no clip. Rather than fail silently, say so and offer the way in
  // that never needed one.
  const cameraDenied = useCallback(() => {
    setRejection({
      status: "capture_rejected",
      reason: "We could not open your camera. Allow camera access and try " +
              "again, or tell us a pair of jeans you already own.",
      all_reasons: ["camera unavailable or permission denied"],
      coaching: [],
      capture_quality: {
        head_visible: null, feet_visible: null, body_in_frame: null,
        usable_frames: 0, rotation_coverage: 0,
        frontal_yaw_deg: null, profile_yaw_deg: null,
      },
    });
    setStep("rejected");
  }, []);

  // Like typed numbers, a pair read back through its chart skips the
  // measurements screen: its timer and its consistency tier describe a video,
  // and there was none.
  const anchor = useCallback((chart: BrandChart, w: number, l: number) => {
    const t = twinFromOwnedPair(chart, w, l, height);
    if (!t) return;
    setTwin(t);
    setTicket(EMPTY_TICKET);
    setStep("tailor");
  }, [height]);

  return (
    <Frame ref={phone}>
      {step === "welcome" && (
        <Welcome buttonRef={button}
                 onStart={(h) => fly("#141210", () => start(h))}
                 onUseFile={(h, clip) => { setHeight(h); analyse(clip, h); }}
                 onManual={(h) => fly("#1b1916", () => { setHeight(h); setStep("manual"); })} />
      )}

      {/* The two ways in without a video, side by side: numbers from a tape
          measure, or a pair already owned and the size on its label. Typed
          numbers skip the measurements screen: it would only read back what
          was just typed, under a video-consistency tier that does not apply. */}
      {step === "manual" && (
        <ManualEntry onBack={() => setStep("welcome")} logoHidden={!!flight}
                     switcher={<NoVideoSwitch value="measurements"
                                              onChange={() => setStep("owned")} />}
                     onDone={(m) => {
                       setTwin(twinFromManual(m, height));
                       setTicket(EMPTY_TICKET);
                       setStep("tailor");
                     }} />
      )}

      {step === "owned" && (
        <Wardrobe onAnchor={anchor} onBack={() => setStep("welcome")}
                  switcher={<NoVideoSwitch value="owned"
                                           onChange={() => setStep("manual")} />} />
      )}

      {(step === "filming" || step === "analysing") && (
        <Filming phase={step === "filming" ? "recording" : "analysing"}
                 progress={progress} isStub={engineIsStub} logoHidden={!!flight}
                 onRecorded={analyse} onCameraDenied={cameraDenied} />
      )}

      {step === "rejected" && rejection && (
        <Rejected result={rejection}
                  onRetry={() => setStep("welcome")}
                  onWardrobe={() => setStep("wardrobe")} />
      )}

      {step === "wardrobe" && (
        <Wardrobe onAnchor={anchor} onBack={() => setStep("rejected")} />
      )}

      {step === "measurements" && twin && (
        <Measurements twin={twin} seconds={elapsed || 11}
                      onNext={() => { setTicket(EMPTY_TICKET); setStep("tailor"); }}
                      onSkip={() => { setTicket(EMPTY_TICKET); setStep("choosing"); }} />
      )}

      {step === "tailor" && (
        <Tailor twin={twin} ticket={ticket} onChange={setTicket}
                onDone={() => setStep("choosing")} />
      )}

      {step === "choosing" && twin && (
        <Choosing twin={twin} needs={needs}
                  onEdit={() => setStep("tailor")}
                  onPick={(p) => { setProduct(p); setStep("product"); }} />
      )}

      {step === "product" && twin && product && (
        <ProductScreen product={product} twin={twin}
                       onBack={() => setStep("choosing")}
                       onBuy={(c) => { setColourId(c); setStep("checkout"); }} />
      )}

      {step === "checkout" && twin && product && (
        <Checkout product={product} colourId={colourId}
                  fit={calculator.recommend(twin, product)}
                  onBack={() => setStep("product")}
                  onPlace={() => setStep("feedback")} />
      )}

      {step === "feedback" && twin && product && (
        <Feedback product={product}
                  size={calculator.recommend(twin, product).size ?? "—"}
                  onAnswer={() => {}} />
      )}

      {flight && <NeedleFlight key={flight.id} {...flight} />}
    </Frame>
  );
}
