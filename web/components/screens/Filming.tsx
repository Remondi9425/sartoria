"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Silhouette } from "@/components/art/Silhouette";
import type { CaptureProgress } from "@/lib/engine/types";

export const RECORD_SECONDS = 10;

/** The container the browser will actually give us. Chrome records WebM, Safari
 *  MP4; the worker reads whichever arrives. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((t) => MediaRecorder.isTypeSupported(t));
}

type CameraState = "starting" | "live" | "denied";

function useRecorder(enabled: boolean, onDone: (clip: Blob) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [elapsed, setElapsed] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const chunks: Blob[] = [];

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera("live");

        const mimeType = pickMimeType();
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
          if (finished.current) return;
          finished.current = true;
          onDone(new Blob(chunks, { type: recorder?.mimeType || "video/webm" }));
        };
        recorder.start(250);

        const began = Date.now();
        timer = window.setInterval(() => {
          const s = (Date.now() - began) / 1000;
          setElapsed(s);
          if (s >= RECORD_SECONDS) {
            window.clearInterval(timer);
            if (recorder?.state === "recording") recorder.stop();
          }
        }, 100);
      } catch {
        if (!cancelled) setCamera("denied");
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (recorder?.state === "recording") recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled, onDone]);

  return { videoRef, camera, elapsed };
}

function Ring({ fraction }: { fraction: number }) {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
      <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="4" />
      <circle cx="32" cy="32" r={R} fill="none" stroke="#e0a458" strokeWidth="4"
              strokeLinecap="round" strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.min(1, fraction))}
              style={{ transition: "stroke-dashoffset .2s linear" }} />
    </svg>
  );
}

export function Filming({
  phase, progress, isStub = false, onRecorded, onCameraDenied,
}: {
  phase: "recording" | "analysing";
  progress: CaptureProgress;
  isStub?: boolean;
  onRecorded: (clip: Blob | null) => void;
  onCameraDenied: () => void;
}) {
  const handleDone = useCallback((clip: Blob) => onRecorded(clip), [onRecorded]);
  const { videoRef, camera, elapsed } = useRecorder(phase === "recording", handleDone);

  useEffect(() => {
    if (camera === "denied") onCameraDenied();
  }, [camera, onCameraDenied]);

  const recording = phase === "recording";
  const fraction = recording
    ? Math.min(1, elapsed / RECORD_SECONDS)
    : progress.fraction;
  const headline = recording
    ? elapsed < 2 ? "Stand back — whole body in frame"
    : elapsed < RECORD_SECONDS - 2 ? "Keep turning, slowly"
    : "Almost there"
    : progress.hint;

  return (
    <div className="relative h-full overflow-hidden bg-navy-deep text-white">
      <video ref={videoRef} autoPlay playsInline muted
             className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover
                         transition-opacity ${camera === "live" ? "opacity-100" : "opacity-0"}`} />
      {camera !== "live" && (
        <div className="absolute inset-0 flex items-end justify-center">
          <Silhouette className="breathe h-[74%] text-white/12" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-deep/75
                      via-navy-deep/25 to-navy-deep/90" />
      {!recording && (
        <div className="scanline absolute inset-x-0 top-0 h-28 bg-gradient-to-b
                        from-transparent via-amber/12 to-transparent" />
      )}

      <div className="pointer-events-none absolute inset-7">
        {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2",
          "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"]
          .map((c) => <span key={c} className={`absolute h-8 w-8 border-white/45 ${c}`} />)}
      </div>

      <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full
                      bg-black/45 px-3 py-1.5 backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${recording ? "bg-rust breathe" : "bg-amber"}`} />
        <span className="text-[12px] font-medium">
          {recording ? "Recording" : "Measuring"}
        </span>
      </div>

      <div className="absolute right-6 top-5">
        <Ring fraction={fraction} />
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="figure text-[17px] font-semibold leading-none">
            {recording ? Math.max(0, Math.ceil(RECORD_SECONDS - elapsed))
                       : Math.round(fraction * 100)}
          </p>
          <p className="text-[7.5px] tracking-[.14em] text-white/60">
            {recording ? "SECONDS" : "PER CENT"}
          </p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-9 px-7 text-center">
        <p className="text-[19px] font-bold">{headline}</p>
        <p className="pt-1.5 text-[11.5px] text-white/60">
          Whole body in the frame · phone at hip height
        </p>
      </div>

      {/* The camera is real; with the stub attached, the measurement is not. */}
      {isStub && (
        <div className="absolute inset-x-0 bottom-0 bg-amber/90 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-navy-deep">
            Demo · the camera is live, the measurement is not
          </p>
        </div>
      )}
    </div>
  );
}
