"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FramingGuide } from "@/components/art/FramingGuide";
import { LegsForming } from "@/components/art/LegsForming";
import { Mannequin } from "@/components/art/Mannequin";
import { CornerLogo, SpeakingBars } from "@/components/ui";
import type { CaptureProgress } from "@/lib/engine/types";

export const RECORD_SECONDS = 10;
/** Long enough to prop the phone, turn round and walk three metres back. */
const POSITION_SECONDS = 5;
/** One full turn in ten seconds is four quarters of two and a half. */
const QUARTER_SECONDS = RECORD_SECONDS / 4;

/** The container the browser will actually give us. Chrome records WebM, Safari
 *  MP4; the worker reads whichever arrives. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((t) => MediaRecorder.isTypeSupported(t));
}

type CameraState = "starting" | "live" | "denied";

/** The back camera, because the person being measured stands 2.5–3 m away and
 *  someone — or a propped phone — is pointing at them. The selfie lens is the
 *  fallback, for a phone stood on a table by someone filming themselves. */
type Facing = "environment" | "user";

/** `brief` — nothing is open yet: the rules, and a body demonstrating them.
 *  `position` — the lens is live and the customer is walking backwards.
 *  `record` — the ten seconds that are actually measured. */
type Stage = "brief" | "position" | "record";

/** Cues for someone three metres away with their back turned.
 *
 *  Every instruction on this screen is unreadable in the moment it matters:
 *  the phone is across the room and for half of the turn it is behind them.
 *  Sound is the only channel left, and the turn — the one rule the engine
 *  cannot recover from being broken — is the one that needs pacing. */
function useCues() {
  const ctx = useRef<AudioContext | null>(null);

  // Built inside the tap that starts the take: iOS grants audio to a gesture
  // and to nothing else.
  const arm = useCallback(() => {
    if (!ctx.current) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) ctx.current = new Ctor();
    }
    void ctx.current?.resume();
  }, []);

  const cue = useCallback((hz: number, ms: number) => {
    const audio = ctx.current;
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime, until = now + ms / 1000;
    osc.type = "sine";
    osc.frequency.value = hz;
    // Ramped rather than switched: a square edge on a phone speaker is a click.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, until);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(until + 0.02);
  }, []);

  useEffect(() => () => { void ctx.current?.close(); }, []);

  return { arm, cue };
}

/** The lens, open from the moment the customer needs to see themselves — which
 *  is while they are walking backwards, not when the recording starts. */
function useCamera(active: boolean, facing: Facing) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      setCamera("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // A fixed size, so every clip costs the same to upload and to
          // decode — but 3:4, which is the shape a phone sensor actually has.
          // Asking for 9:16 was the zoom: a camera that cannot produce the
          // requested ratio is cropped into it, and a quarter of the width
          // went before the body was ever in front of it.
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1080 }, height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamera("live");
      } catch {
        if (!cancelled) setCamera("denied");
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, facing]);

  return { videoRef, streamRef, camera };
}

function useRecorder(
  streamRef: React.RefObject<MediaStream | null>,
  recording: boolean,
  onDone: (clip: Blob) => void,
) {
  const [elapsed, setElapsed] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    const stream = streamRef.current;
    if (!recording || !stream) return;
    let cancelled = false;
    const chunks: Blob[] = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      // A take abandoned — by leaving the screen — is not a take.
      if (cancelled || finished.current) return;
      finished.current = true;
      onDone(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
    recorder.start(250);

    const began = Date.now();
    const timer = window.setInterval(() => {
      const s = (Date.now() - began) / 1000;
      setElapsed(s);
      if (s >= RECORD_SECONDS) {
        window.clearInterval(timer);
        if (recorder.state === "recording") recorder.stop();
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (recorder.state === "recording") recorder.stop();
    };
  }, [recording, streamRef, onDone]);

  return elapsed;
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

/** Each rule is a failure the engine cannot recover from, said as an action. */
const RULES: [string, string][] = [
  ["Phone at hip height, 2.5–3 m back",
   "A palm of space above your head and below your feet. Without the top of your head there is no scale."],
  ["Fitted clothes",
   "Leggings or shorts and a close top. Loose fabric becomes your body's surface and nothing afterwards can tell."],
  ["Barefoot, feet 20–30 cm apart",
   "Shoes add centimetres and move the heel. The gap is how your legs are told apart."],
  ["Turn slowly, all the way round",
   "Ten seconds, one full circle. Your tailor calls each quarter turn."],
];

/** What the tailor says, in seconds from "I'm ready": five to get in place,
 *  then the ten that are recorded.
 *
 *  Lines that describe the picture ("I can't see your feet yet") are marked
 *  and never said: nothing here looks at the frames, and a coach that claims
 *  to see what it cannot is worse than one that keeps time. They are kept so
 *  that a frame check, when it exists, has its words waiting. */
const COACH: { at: number; line: string; needsFrameCheck?: boolean }[] = [
  { at: 0, line: "Walk back until your whole body is in the frame." },
  { at: 2.5, line: "A little further. I can't see your feet yet.", needsFrameCheck: true },
  { at: 4, line: "Good, head to feet. Arms slightly out.", needsFrameCheck: true },
  { at: 5, line: "Recording. Start turning slowly to your left." },
  { at: 7.5, line: "Quarter turn. Nice and slow." },
  { at: 10, line: "Halfway. Keep your feet where they are." },
  { at: 12.5, line: "Last quarter." },
  { at: 14.3, line: "That's it. You can come back to the phone." },
].filter((c) => !c.needsFrameCheck);

/** The same lines, out loud — the customer is facing away for half of them. */
function useVoice() {
  const said = useRef(new Set<string>());
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  // iOS, again: speech is granted to a gesture, so the first utterance is an
  // empty one inside the tap.
  const arm = useCallback(() => {
    if (!supported) return;
    said.current.clear();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }, [supported]);

  const say = useCallback((line: string) => {
    if (!supported || said.current.has(line)) return;
    said.current.add(line);
    const u = new SpeechSynthesisUtterance(line);
    u.lang = "en-GB";
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  }, [supported]);

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  return { arm, say };
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
  const [facing, setFacing] = useState<Facing>("environment");
  const [stage, setStage] = useState<Stage>("brief");
  const [left, setLeft] = useState(POSITION_SECONDS);
  // The shape the camera actually gave us, so the guide can sit on the picture
  // rather than near it.
  const [ratio, setRatio] = useState(0.75);

  const filming = phase === "recording";
  const { videoRef, streamRef, camera } = useCamera(filming && stage !== "brief", facing);
  const handleDone = useCallback((clip: Blob) => onRecorded(clip), [onRecorded]);
  const elapsed = useRecorder(streamRef, filming && stage === "record", handleDone);
  const { arm, cue } = useCues();
  const { arm: armVoice, say } = useVoice();

  useEffect(() => {
    if (camera === "denied") onCameraDenied();
  }, [camera, onCameraDenied]);

  // Walking backwards. The clock only runs while there is a picture to walk
  // into — a lens still opening is not five seconds of anybody's time.
  const ticked = useRef(0);
  useEffect(() => {
    if (!(filming && stage === "position" && camera === "live")) return;
    const began = Date.now();
    ticked.current = 0;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, POSITION_SECONDS - (Date.now() - began) / 1000);
      setLeft(remaining);
      const second = Math.ceil(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        cue(880, 160);
        setStage("record");
      } else if (second <= 3 && second !== ticked.current) {
        ticked.current = second;
        cue(660, 55);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [filming, stage, camera, cue]);

  // The quarters of the turn, and the end. Nothing here is decoration: it is
  // the only instruction that arrives while the customer is facing away.
  const quarters = useRef(0);
  useEffect(() => {
    if (stage !== "record") return;
    const due = Math.min(4, Math.floor(elapsed / QUARTER_SECONDS));
    if (due <= quarters.current) return;
    quarters.current = due;
    // The last one is lower and longer — from three metres away it is the only
    // way to know the ten seconds are over.
    cue(due === 4 ? 440 : 880, due === 4 ? 320 : 90);
  }, [stage, elapsed, cue]);

  const begin = useCallback(() => { arm(); armVoice(); setStage("position"); }, [arm, armVoice]);

  const positioning = filming && stage === "position";
  const recording = filming && stage === "record";
  // Seconds since "I'm ready", on the one clock the coach script is keyed to.
  // The last line lands a moment before the recorder stops, so it is heard
  // while the phone is still in front of them.
  const t = positioning ? (camera === "live" ? POSITION_SECONDS - left : 0)
    : recording ? POSITION_SECONDS + elapsed : 0;
  const lines = positioning || recording
    ? COACH.filter((c) => t >= c.at).map((c) => c.line)
    : progress.hint ? [`${progress.hint.replace(/[.…]+$/, "")}.`] : [];
  const coach = lines.slice(-2);
  const latest = positioning || recording ? coach[coach.length - 1] : undefined;
  useEffect(() => { if (latest) say(latest); }, [latest, say]);

  if (filming && stage === "brief") {
    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-ground-deep
                      px-7 pb-[26px] pt-9 text-chalk">
        <CornerLogo />
        <p className="eyebrow !text-chalk/45">Before the ten seconds</p>
        <h2 className="pt-2.5 font-serif text-[36px] leading-[1.02] font-normal">
          Set the phone down,<br />then walk <em>back.</em>
        </h2>

        {/* Shown turning at the pace the rules ask for, because a full circle
            is the one instruction that cannot be recovered from afterwards —
            and because it is drawn as the scan the customer will be handed,
            the brief and the answer are recognisably the same thing. */}
        <div className="my-2 min-h-0 flex-1">
          <Mannequin className="h-full w-full" />
        </div>

        <div className="mb-4 flex items-center gap-2.5 rounded-[14px] border border-amber/25
                        bg-amber/10 px-3 py-2.5">
          <SpeakingBars />
          <span className="text-[12px] leading-[1.4]">
            Your tailor talks you through it out loud. You won&apos;t need to read
            the screen.
          </span>
        </div>

        <ol className="space-y-3">
          {RULES.map(([what, why], i) => (
            <li key={what} className="flex gap-3.5">
              <span className="figure mt-px grid h-5 w-5 shrink-0 place-content-center
                               rounded-full bg-chalk/8 text-[10px] font-medium text-amber">
                {i + 1}
              </span>
              <span className="block">
                <span className="block text-[13px] font-semibold leading-tight">{what}</span>
                <span className="block pt-[3px] text-[11px] leading-[1.4] text-chalk/55">{why}</span>
              </span>
            </li>
          ))}
        </ol>

        <button type="button" onClick={begin}
                className="mt-[22px] w-full rounded-full bg-chalk py-4 text-[15px] font-semibold
                           text-ground transition hover:bg-white active:scale-[.99]">
          I&apos;m ready
        </button>
      </div>
    );
  }

  // Once the ten seconds are up the stream is closed, and what the video
  // element holds is a frozen last frame. Better to stop showing it.
  const showCamera = filming && stage !== "brief" && camera === "live";

  const fraction = positioning ? 1 - left / POSITION_SECONDS
    : recording ? Math.min(1, elapsed / RECORD_SECONDS)
    : progress.fraction;

  return (
    <div className="relative h-full overflow-hidden bg-ground-deep text-chalk">
      {/* Contained, not cropped: the preview has to show everything the engine
          will be given, or it will say a head is in shot that is not. Only the
          selfie view is mirrored — a mirrored world is what one expects of
          oneself and nobody expects of the room. */}
      <video ref={videoRef} autoPlay playsInline muted
             onLoadedMetadata={(e) => {
               const v = e.currentTarget;
               if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
             }}
             className={`absolute inset-0 h-full w-full object-contain
                         transition-opacity ${facing === "user" ? "scale-x-[-1]" : ""}
                         ${showCamera ? "opacity-100" : "opacity-0"}`} />
      {/* Nothing to show from the lens — the clip came from the library, or
          the camera has not opened yet. A body stands in, drawn as the scan
          the customer is about to be handed: points, turning. */}
      {!showCamera && (
        <div className="absolute inset-x-[30px] bottom-[230px] top-[110px]">
          {filming
            ? <Mannequin className="h-full w-full" />
            : <LegsForming measured={progress.fraction} className="h-full w-full" />}
        </div>
      )}
      {!filming && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="scanline absolute inset-x-0 top-0 h-28 bg-gradient-to-b
                          from-transparent via-amber/12 to-transparent" />
        </div>
      )}
      <div className="absolute inset-0"
           style={{ background: "linear-gradient(to bottom,rgba(20,18,16,.7),rgba(20,18,16,.1) 35%," +
                                "rgba(20,18,16,.2) 55%,rgba(20,18,16,.95) 78%)" }} />
      {/* The target, while there is still time to step into it. It is still on
          purpose: a moving outline is not something a body can be matched to. */}
      {showCamera && (
        <FramingGuide ratio={ratio}
                      className={`pointer-events-none absolute inset-0 h-full w-full
                                  text-amber/70 transition-opacity duration-700
                                  ${positioning ? "opacity-100" : "opacity-0"}`} />
      )}

      <div className="pointer-events-none absolute inset-7">
        {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2",
          "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"]
          .map((c) => <span key={c} className={`absolute h-8 w-8 border-chalk/45 ${c}`} />)}
      </div>

      <div className="absolute left-6 top-6 flex items-center gap-2 rounded-full
                      bg-black/45 px-3 py-1.5 backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${recording ? "bg-rust breathe" : "bg-amber"}`} />
        <span className="text-[12px] font-medium">
          {positioning ? "Get in place" : recording ? "Recording" : "Measuring"}
        </span>
      </div>

      <div className="absolute right-6 top-5">
        <Ring fraction={fraction} />
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="figure text-[17px] font-semibold leading-none">
            {positioning ? Math.ceil(left)
              : recording ? Math.max(0, Math.ceil(RECORD_SECONDS - elapsed))
              : Math.round(fraction * 100)}
          </p>
          <p className="text-[7.5px] tracking-[.14em] text-white/60">
            {positioning || recording ? "SECONDS" : "PER CENT"}
          </p>
        </div>
      </div>

      {/* Which lens is right depends on who is holding the phone, and only the
          person holding it knows. Offered while there is still time to change
          it — a lens change after the recording starts is a lost take. */}
      {positioning && (
        <button type="button"
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                className="absolute left-6 top-[4.5rem] rounded-full bg-black/45 px-3 py-1.5
                           text-[11px] font-medium backdrop-blur active:bg-black/65">
          {facing === "environment" ? "Use front camera" : "Use back camera"}
        </button>
      )}

      {/* The tailor: the last two things said, the older one fading. */}
      <div className={`absolute inset-x-5 flex flex-col gap-2 ${isStub ? "bottom-[62px]" : "bottom-9"}`}
           aria-live="polite">
        <div className="flex items-center gap-2 pl-1">
          <SpeakingBars />
          <span className="figure text-[9.5px] font-medium tracking-[.16em] text-amber uppercase">
            Tailor · speaking
          </span>
        </div>
        {coach.map((line, i) => (
          <div key={line}
               className="rounded-[18px_18px_18px_4px] border border-chalk/8 bg-[rgba(37,34,30,.92)]
                          px-[15px] py-3 font-serif text-[21px] leading-[1.2] transition-opacity
                          duration-[400ms]"
               style={{ opacity: i === coach.length - 1 ? 1 : 0.45 }}>
            {line}
          </div>
        ))}
      </div>

      {/* The camera is real; with the stub attached, the measurement is not. */}
      {isStub && (
        <div className="absolute inset-x-0 bottom-0 bg-amber/90 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-ground">
            Demo · the camera is live, the measurement is not
          </p>
        </div>
      )}
    </div>
  );
}
