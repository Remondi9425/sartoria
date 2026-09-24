"use client";

import { useEffect, useRef } from "react";
import { Needle } from "@/components/ui";

export const FLIGHT_MS = 3400;
/** When the screen underneath is swapped: while the veil is opaque. */
export const SWAP_MS = 1620;
/** When the overlay goes and the static logo takes its place. */
export const LAND_MS = 3420;

/** Coordinates are the phone's own pixels, from its top-left corner — so the
 *  flight lands where the static logo will be drawn whatever the phone's size. */
export interface Flight {
  /** The phone's rendered size. */
  width: number;
  height: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  size: number;
  veil: string;
}

const EASE = "cubic-bezier(.42,0,.58,1)";
const A = 14;      // wave amplitude
const N = 2.5;     // waves across the screen
const A0 = 0.26, A1 = 0.78;

/**
 * The needle is pulled out of the wordmark's button, stitches across the top
 * of the screen and dives into the corner, where it becomes the logo.
 */
export function NeedleFlight({ width, height, from, to, size, veil }: Flight) {
  const needle = useRef<HTMLDivElement>(null);
  const veilEl = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLDivElement>(null);
  const up = useRef<HTMLDivElement>(null);
  const thread = useRef<SVGSVGElement>(null);

  const lane = from.y - 20;
  const x0 = from.x, x1 = to.x - 18;
  const W = Math.max(40, x1 - x0);
  const yAt = (t: number) => lane + A * Math.sin(2 * Math.PI * N * t);
  const path = Array.from({ length: 81 }, (_, k) => {
    const t = k / 80;
    return `${k ? "L" : "M"}${(x0 + W * t).toFixed(1)} ${yAt(t).toFixed(1)}`;
  }).join(" ");

  useEffect(() => {
    const T = (x: number, y: number, r: number, s = 1.3) =>
      `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${r}deg) scale(${s})`;
    const slope0 = Math.atan(A * 2 * Math.PI * N / W) * 180 / Math.PI;
    const frames: Keyframe[] = [
      { transform: T(x0, from.y, 180), opacity: 0, offset: 0 },
      { transform: T(x0, from.y - 6, 180), opacity: 1, offset: 0.05 },
      { transform: T(x0, lane, 180), offset: 0.17 },
    ];
    const n = 28;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const slope = (A * 2 * Math.PI * N / W) * Math.cos(2 * Math.PI * N * t);
      frames.push({
        transform: T(x0 + W * t, yAt(t), 270 + Math.atan(slope) * 180 / Math.PI),
        offset: A0 + (A1 - A0) * t,
      });
    }
    // The turn onto the wave, before it starts travelling.
    frames[3].transform = T(x0, lane, 270 + slope0);
    frames.push({ transform: T(to.x, to.y, 392, 1), offset: 0.92 },
                { transform: T(to.x, to.y, 392, 1), offset: 1 });

    const opts: KeyframeAnimationOptions = { duration: FLIGHT_MS, easing: EASE, fill: "forwards" };
    const clip = (x: number) => `inset(0 ${width - x}px 0 0)`;
    const running = [
      needle.current?.animate(frames, opts),
      thread.current?.animate([
        { clipPath: clip(x0), opacity: 1, offset: 0 },
        { clipPath: clip(x0), offset: A0 },
        { clipPath: clip(x1), offset: A1 },
        { clipPath: clip(x1), opacity: 1, offset: 0.86 },
        { clipPath: clip(x1), opacity: 0, offset: 1 },
      ], opts),
      up.current?.animate([
        { transform: "scaleY(0)" }, { transform: "scaleY(0)", offset: 0.04 },
        { transform: "scaleY(1)", offset: 0.17 },
        { transform: "scaleY(1)", opacity: 1, offset: 0.86 },
        { transform: "scaleY(1)", opacity: 0 },
      ], opts),
      veilEl.current?.animate([
        { opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1, offset: 0.44 },
        { opacity: 1, offset: 0.52 }, { opacity: 0, offset: 0.8 }, { opacity: 0 },
      ], { duration: FLIGHT_MS, fill: "forwards" }),
      tile.current?.animate([
        { opacity: 0 }, { opacity: 0, offset: 0.84 }, { opacity: 1, offset: 0.97 },
        { opacity: 1 },
      ], { duration: FLIGHT_MS, fill: "forwards" }),
    ];
    return () => running.forEach((a) => a?.cancel());
    // A flight is fixed from the moment it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const L = Math.round(size * 0.92);
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-30 overflow-hidden"
         style={{ width, height }} aria-hidden="true">
      <div ref={veilEl} className="absolute inset-0" style={{ background: veil, opacity: 0 }} />
      <div ref={up} className="absolute"
           style={{ left: x0 - 1, top: lane, width: 0, height: from.y - lane,
                    borderLeft: "2px dashed #e0a458", transformOrigin: "bottom",
                    transform: "scaleY(0)" }} />
      <svg ref={thread} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
           className="absolute left-0 top-0 overflow-visible"
           style={{ clipPath: `inset(0 ${width - x0}px 0 0)` }}>
        <path d={path} fill="none" stroke="#e0a458" strokeWidth={2}
              strokeDasharray="5 4" strokeLinecap="round" />
      </svg>
      <div ref={tile} className="absolute grid place-content-center bg-ground-deep"
           style={{ left: to.x - size / 2, top: to.y - size / 2, width: size, height: size,
                    borderRadius: Math.round(size / 4),
                    outline: "1px solid rgba(240,231,217,.12)", opacity: 0 }}>
        <span className="font-serif italic text-chalk"
              style={{ fontSize: Math.round(size * 0.88), lineHeight: 1,
                       transform: "translateY(-1px)" }}>S</span>
      </div>
      <div ref={needle} className="absolute left-0 top-0"
           style={{ width: 3, height: L, opacity: 0, willChange: "transform" }}>
        <Needle length={L} style={{ left: 0, top: 0 }} />
      </div>
    </div>
  );
}
