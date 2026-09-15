"use client";

import { useEffect, useRef } from "react";

/**
 * The customer's own legs, from the surface points the body model produced.
 * Turns by itself, and follows a finger.
 *
 * Drawn in two passes, because recolouring the points is not a surface. The
 * first closes the cloud into a body; the second puts the measured points back
 * on top of it, where they face us. Keeping them visible is deliberate: this
 * is a body we worked out from a video, and a smooth shell on its own would
 * claim a precision the measurement does not have.
 *
 * A cloud rather than a mesh at all because the triangles that would join
 * these points belong to the SMPL model files, whose licence this project
 * deliberately avoided needing.
 *
 * Canvas rather than a 3-D library: a rotation matrix and a back-to-front sort
 * do not need a renderer, and the app stays free of a dependency it would use
 * in one place.
 */

/**
 * A warm material, not a skin colour.
 *
 * "Flesh tone" fits one set of people and quietly excludes everyone else, and
 * this app has no idea who is looking at it. Closer to clay than to a
 * photograph: it reads as a body without claiming to be anybody's skin.
 */
const WARM = [222, 138, 132];
/** Wide enough that neighbouring points overlap, which is what closes the
 *  cloud into a surface. Too small and the body falls back into a swarm. */
const SKIN_RADIUS = 6.6;
/** The measured points, over the skin, where it faces us. */
const MESH_INK = [120, 52, 54];

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

    // Fit the body once; it does not change while it turns.
    let minY = Infinity, maxY = -Infinity, spread = 0;
    for (const [x, y, z] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      spread = Math.max(spread, Math.abs(x), Math.abs(z));
    }
    const midY = (minY + maxY) / 2;

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

      // Pass one — the outline. Wider discs in one mid tone, whose only job is
      // to close the silhouette. Shading them individually left the edge
      // scalloped, because at the boundary each disc is its own little circle.
      ctx.fillStyle = `rgb(${WARM.map((c) => Math.round(c * 0.72)).join(",")})`;
      for (const [px, py] of projected) {
        ctx.beginPath();
        ctx.arc(px, py, SKIN_RADIUS * 1.22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pass two — the modelling, inside that outline, so the form has a near
      // side and a far one.
      for (const [px, py, depth] of projected) {
        const near = (depth / (spread || 1) + 1) / 2;
        const shade = 0.62 + near * 0.38;
        ctx.fillStyle = `rgb(${WARM.map((c) => Math.round(c * shade)).join(",")})`;
        ctx.beginPath();
        ctx.arc(px, py, SKIN_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pass three — the scan itself, fading out as the surface turns away.
      for (const [px, py, depth] of projected) {
        const near = (depth / (spread || 1) + 1) / 2;
        if (near < 0.58) continue;
        ctx.fillStyle = `rgba(${MESH_INK.join(",")}, ${(near - 0.58) * 0.78})`;
        ctx.fillRect(px - 0.7, py - 0.7, 1.4, 1.4);
      }

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
