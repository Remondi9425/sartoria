"use client";

import { useEffect, useRef } from "react";

/**
 * The customer's own legs, drawn from the surface points the body model
 * produced. Turns by itself, and follows a finger.
 *
 * A point cloud rather than a surface: the triangles that would join these
 * points belong to the SMPL model files, whose licence this project
 * deliberately avoided needing. At this density a leg reads as a limb anyway,
 * and it reads honestly — a scan looks like a scan, where a smooth surface
 * would imply a precision the measurement does not have.
 *
 * Canvas rather than a 3-D library: two thousand points, one rotation matrix
 * and a painter's-algorithm sort do not need a renderer, and the app stays
 * free of a dependency it would use in one place.
 */
/**
 * A warm material, not a skin colour.
 *
 * "Flesh tone" is a choice that fits one set of people and quietly excludes
 * everyone else, and this app has no idea who is looking at it. So the legs
 * are rendered in something that reads as a body without claiming to be
 * anybody's skin — closer to clay than to a photograph.
 */
const WARM = [214, 122, 118];
const DOT_RADIUS = 6.0;
const SPRITE_PX = 48;


export function LegScan({
  points, className = "",
}: { points: [number, number, number][]; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; spin: number } | null>(null);
  const spin = useRef(0.6);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fit the body to the canvas once; it does not change while it turns.
    let minY = Infinity, maxY = -Infinity, spread = 0;
    for (const [x, y, z] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      spread = Math.max(spread, Math.abs(x), Math.abs(z));
    }
    const midY = (minY + maxY) / 2;

    // One soft disc, drawn once and stamped thousands of times.
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = SPRITE_PX;
    const sctx = sprite.getContext("2d")!;
    const g = sctx.createRadialGradient(
      SPRITE_PX / 2, SPRITE_PX / 2, 0, SPRITE_PX / 2, SPRITE_PX / 2, SPRITE_PX / 2);
    g.addColorStop(0, `rgba(${WARM.join(",")}, 0.95)`);
    g.addColorStop(0.45, `rgba(${WARM.join(",")}, 0.45)`);
    g.addColorStop(1, `rgba(${WARM.join(",")}, 0)`);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!drag.current && !still) spin.current += (now - last) / 5200;
      last = now;

      const scale = Math.min(h / (maxY - minY || 1), w / (spread * 2.6)) * 0.86;
      const cos = Math.cos(spin.current), sin = Math.sin(spin.current);

      // Painter's algorithm: far points first, so near ones cover them.
      const projected: [number, number, number][] = points.map(([x, y, z]) => {
        const rx = x * cos + z * sin;
        const rz = z * cos - x * sin;
        return [w / 2 + rx * scale, h / 2 - (y - midY) * scale, rz];
      });
      projected.sort((a, b) => a[2] - b[2]);

      // Soft overlapping discs rather than pixels: where the surface is dense
      // they build into a solid form, and where it curves away they thin out.
      // That build-up is the whole illusion, so blending is additive-ish and
      // the sprite is drawn rather than painted per point — a gradient per
      // point per frame is eighteen hundred gradients sixty times a second.
      // Plain over-painting on a light ground: overlapping discs accumulate
      // toward opaque where the surface is dense, which is the solidity we
      // want. Multiply looked right in theory and muddy in practice.
      for (const [px, py, depth] of projected) {
        const near = (depth / (spread || 1) + 1) / 2;
        const r = DOT_RADIUS * (0.62 + near * 0.48);
        ctx.globalAlpha = 0.045 + near * 0.26;
        ctx.drawImage(sprite, px - r, py - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [points]);

  const start = (x: number) => { drag.current = { x, spin: spin.current }; };
  const move = (x: number) => {
    if (!drag.current) return;
    spin.current = drag.current.spin + (x - drag.current.x) / 90;
  };
  const end = () => { drag.current = null; };

  return (
    <canvas
      ref={canvasRef}
      className={`touch-none select-none ${className}`}
      aria-label="Your legs, as measured — drag to turn"
      role="img"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start(e.clientX);
      }}
      onPointerMove={(e) => move(e.clientX)}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
