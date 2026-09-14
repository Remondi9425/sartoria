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
  [0.62, "Fitting a body to the frames"],
  [0.82, "Measuring round the mesh"],
];

const POLL_MS = 2_000;
const MAX_POLLS = 150;          // five minutes, well past a cold start

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });

const UNKNOWN_QUALITY: CaptureQuality = {
  head_visible: null, feet_visible: null, body_in_frame: null,
  usable_frames: 0, rotation_coverage: 0,
  frontal_yaw_deg: null, profile_yaw_deg: null,
};

/** A refusal the worker produced, passed through unchanged. */
function asRejection(body: Record<string, unknown>): CaptureResult {
  return {
    status: "capture_rejected",
    reason: String(body.reason ?? "That capture could not be used."),
    all_reasons: (body.all_reasons as string[]) ?? [String(body.reason ?? "")],
    coaching: (body.coaching as string[]) ?? [],
    capture_quality: (body.capture_quality as CaptureQuality) ?? UNKNOWN_QUALITY,
  };
}


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

      const began = Date.now();
      const tick = (fraction: number) => {
        const hint = [...PHASES].reverse().find(([at]) => fraction >= at)?.[1]
                     ?? PHASES[0][1];
        onProgress?.({ fraction, hint });
      };

      try {
        // Upload first. The server answers as soon as it has the bytes — it
        // does not hold the connection open while a GPU works, because a
        // request kept alive for two minutes does not survive the round trip.
        const form = new FormData();
        const ext = video.type.includes("mp4") ? "mp4"
                  : video.type.includes("quicktime") ? "mov" : "webm";
        form.append("video", video, `clip.${ext}`);
        form.append("height_cm", String(heightCm));

        tick(0.05);
        const submit = await fetch(`${baseUrl}/analyse`, {
          method: "POST", body: form, signal,
        });
        if (!submit.ok && submit.status !== 202) {
          return rejected(
            `The measurement engine answered ${submit.status}. Check the Modal ` +
            `deployment is up: modal app list`);
        }
        const ticket = await submit.json();
        if (ticket.status === "capture_rejected") return asRejection(ticket);
        if (!ticket.job_id) {
          return rejected("The engine accepted the clip but gave us nothing to wait on.");
        }

        // Then wait. A cold container takes about two minutes; a warm one
        // twenty seconds. The bar reflects elapsed time honestly and stops
        // short of the end, because we are not told how far along it is.
        for (let i = 0; i < MAX_POLLS; i++) {
          await sleep(POLL_MS, signal);
          tick(Math.min(0.94, 0.05 + (Date.now() - began) / 150_000));
          const res = await fetch(`${baseUrl}/result/${ticket.job_id}`, { signal });
          if (!res.ok) continue;
          const body = await res.json();
          if (body.status === "working") continue;

          onProgress?.({ fraction: 1, hint: "Done" });
          if (body.status === "capture_rejected") return asRejection(body);
          delete body.status;
          delete body.took_seconds;
          return { status: "ok", twin: body as DigitalTwin, coaching: [] };
        }
        return rejected(
          "The measurement is taking longer than it should. Try again in a moment.");
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        return rejected(
          "We could not reach the measurement engine. Check it is running on " +
          `${baseUrl}.`);
      }
    },
  };
}
