/**
 * The real engine, over HTTP.
 *
 * Implements exactly the same interface as the stub, so nothing above it
 * changes. The Python worker returns the twin shape defined in types.ts — the
 * two files are the same contract in two languages, which is why neither has a
 * translation layer.
 */
import type {
  AnalyseInput, CaptureQuality, CaptureResult, DigitalTwin, MeasurementEngine,
} from "./types";

/** What the worker is doing while it works. It cannot tell us, so this is an
 *  honest guess at the shape of the wait, not a report of progress. */
const PHASES: [number, string][] = [
  [0.00, "Sending your clip"],
  [0.15, "Looking for you in the frames"],
  [0.40, "Checking head and feet are in shot"],
  [0.62, "Following the turn"],
  [0.82, "Turning pixels into centimetres"],
];

const UNKNOWN_QUALITY: CaptureQuality = {
  head_visible: null, feet_visible: null, body_in_frame: null,
  usable_frames: 0, rotation_coverage: 0,
  frontal_yaw_deg: null, profile_yaw_deg: null,
};

function rejected(reason: string, quality = UNKNOWN_QUALITY): CaptureResult {
  return {
    status: "capture_rejected",
    reason,
    all_reasons: [reason],
    coaching: [],
    capture_quality: quality,
  };
}

export function createHttpEngine(baseUrl: string): MeasurementEngine {
  return {
    name: `http:${baseUrl}`,
    isStub: false,

    async analyse({ heightCm, video, onProgress, signal }: AnalyseInput): Promise<CaptureResult> {
      if (!video) {
        return rejected(
          "No video reached us. Allow camera access and record again.");
      }

      // The request is one round trip with no streaming, so the bar is a
      // plausible wait rather than a measurement. It stops short of the end and
      // only completes when the answer actually lands.
      let stop = false;
      const began = Date.now();
      const tick = () => {
        if (stop) return;
        const f = Math.min(0.93, (Date.now() - began) / 14000);
        const hint = [...PHASES].reverse().find(([at]) => f >= at)?.[1] ?? PHASES[0][1];
        onProgress?.({ fraction: f, hint });
        requestAnimationFrame(tick);
      };
      tick();

      try {
        const form = new FormData();
        // Name the part after what was actually recorded. Chrome hands back
        // VP9 inside an MP4 container, which decodes fine — but only if the
        // decoder is not told it is looking at something else.
        const ext = video.type.includes("mp4") ? "mp4" : "webm";
        form.append("video", video, `clip.${ext}`);
        form.append("height_cm", String(heightCm));

        const res = await fetch(`${baseUrl}/analyse`, {
          method: "POST", body: form, signal,
        });
        if (!res.ok) {
          return rejected(
            `The measurement engine answered ${res.status}. It may not be ` +
            `running — start it with: uvicorn spike.serve:app --port 8000`);
        }

        const body = await res.json();
        onProgress?.({ fraction: 1, hint: "Done" });

        if (body.status === "capture_rejected") {
          return {
            status: "capture_rejected",
            reason: body.reason,
            all_reasons: body.all_reasons ?? [body.reason],
            coaching: body.coaching ?? [],
            capture_quality: body.capture_quality ?? UNKNOWN_QUALITY,
          };
        }
        // strip the transport-only fields; the rest is the twin verbatim
        delete body.status;
        delete body.took_seconds;
        return { status: "ok", twin: body as DigitalTwin, coaching: [] };
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        return rejected(
          "We could not reach the measurement engine. Check it is running on " +
          `${baseUrl}.`);
      } finally {
        stop = true;
      }
    },
  };
}
