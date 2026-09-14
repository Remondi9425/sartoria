"use client";

import { useEffect, useRef, useState } from "react";
import { Silhouette } from "@/components/art/Silhouette";
import type { CaptureProgress } from "@/lib/engine/types";

/** Tries the real camera, because the framing guides only mean something
 *  against a real body. Falls back to a silhouette wherever it is unavailable —
 *  a locked-down browser, a machine with no camera, a denied permission. */
function useCamera(active: boolean) {
  const ref = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: 720 }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (ref.current) { ref.current.srcObject = s; setLive(true); }
      })
      .catch(() => setLive(false));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return { ref, live };
}

export function Filming({ progress }: { progress: CaptureProgress }) {
  const { ref, live } = useCamera(true);
  const pct = Math.round(progress.fraction * 100);
  const R = 26, C = 2 * Math.PI * R;

  return (
    <div className="relative h-full overflow-hidden bg-navy-deep text-white">
      <video ref={ref} autoPlay playsInline muted
             className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover
                         ${live ? "opacity-100" : "opacity-0"}`} />
      {!live && (
        <div className="absolute inset-0 flex items-end justify-center">
          <Silhouette className="breathe h-[74%] text-white/12" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-deep/75
                      via-navy-deep/25 to-navy-deep/90" />

      {/* the sweep only ever signals that work is happening */}
      <div className="scanline absolute inset-x-0 top-0 h-28 bg-gradient-to-b
                      from-transparent via-amber/12 to-transparent" />

      {/* framing guides — what the gates are actually checking */}
      <div className="pointer-events-none absolute inset-7">
        {[
          "left-0 top-0 border-l-2 border-t-2",
          "right-0 top-0 border-r-2 border-t-2",
          "left-0 bottom-0 border-l-2 border-b-2",
          "right-0 bottom-0 border-r-2 border-b-2",
        ].map((c) => (
          <span key={c} className={`absolute h-8 w-8 border-white/45 ${c}`} />
        ))}
      </div>

      <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full
                      bg-black/45 px-3 py-1.5 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-rust breathe" />
        <span className="text-[12px] font-medium">Recording</span>
      </div>

      <div className="absolute right-6 top-5">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
          <circle cx="32" cy="32" r={R} fill="none" stroke="#e0a458" strokeWidth="4"
                  strokeLinecap="round" strokeDasharray={C}
                  strokeDashoffset={C * (1 - progress.fraction)}
                  style={{ transition: "stroke-dashoffset .25s linear" }} />
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="figure text-[17px] font-semibold leading-none">{pct}</p>
          <p className="text-[7.5px] tracking-[.14em] text-white/60">PER CENT</p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-9 px-7 text-center">
        <p className="text-[19px] font-bold">{progress.hint}</p>
        <p className="pt-1.5 text-[11.5px] text-white/60">
          Whole body in the frame · phone at hip height
        </p>
      </div>
    </div>
  );
}
