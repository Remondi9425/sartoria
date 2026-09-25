"use client";

import type { ReactNode } from "react";

export function Screen({
  children, dark = false, className = "",
}: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div className={`relative flex h-full flex-col text-chalk
                     ${dark ? "bg-ground-deep" : "bg-ground"} ${className}`}>
      {children}
    </div>
  );
}

export function Body({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto px-7 ${className}`}>{children}</div>;
}

export function Footer({ children }: { children: ReactNode }) {
  return <div className="shrink-0 px-7 pb-7 pt-3">{children}</div>;
}

export function Button({
  children, onClick, variant = "primary", disabled,
}: {
  children: ReactNode; onClick?: () => void;
  variant?: "primary" | "outline" | "ghost"; disabled?: boolean;
}) {
  const base =
    "w-full rounded-full transition disabled:cursor-not-allowed disabled:opacity-40";
  const look = {
    primary: "bg-chalk py-4 text-[15px] font-semibold text-ground hover:bg-white active:scale-[.99]",
    outline: "border border-chalk/30 bg-transparent py-4 text-[15px] font-semibold text-chalk " +
             "hover:border-chalk active:scale-[.99]",
    ghost: "py-1 text-[12.5px] text-chalk underline underline-offset-4 hover:text-amber",
  }[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
            className={`${base} ${look}`}>
      {children}
    </button>
  );
}

/** A quiet way back, above the eyebrow. */
export function BackLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
            className="pt-[22px] text-[12.5px] text-mute hover:text-chalk">
      {children}
    </button>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow pt-6 pb-2.5">{children}</p>;
}

/** Serif, with the last phrase in an `<em>` so it lands in amber. */
export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-serif text-[36px] leading-[1.02] font-normal text-chalk">
      {children}
    </h1>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-[1.5] text-faint">{children}</p>;
}

/** Says out loud that the numbers are invented. It should be impossible to
 *  mistake this demo for a working measurement. */
export function StubBadge() {
  return (
    <div className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full
                    bg-amber/15 px-2.5 py-1 text-[9.5px] font-semibold tracking-[.12em]
                    text-amber uppercase">
      <span className="h-1.5 w-1.5 rounded-full bg-amber" />
      demo · numbers not measured
    </div>
  );
}

/** The tailor, speaking: four amber bars. */
export function SpeakingBars() {
  return (
    <div className="flex h-3.5 flex-none items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i}
              className="speak block h-3.5 w-[2.5px] origin-center rounded-sm bg-amber"
              style={{ ["--speak-d" as string]: `${0.7 + i * 0.13}s`,
                       ["--speak-delay" as string]: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

/** The tailor, thinking: three dots. */
export function TypingDots() {
  return (
    <div className="flex h-2 items-center gap-[5px]" aria-label="The tailor is writing">
      {[0, 1, 2].map((d) => (
        <span key={d} className="typing-dot block h-1.5 w-1.5 rounded-full bg-mute"
              style={{ ["--dot-delay" as string]: `${d * 0.15}s` }} />
      ))}
    </div>
  );
}

/**
 * The scissors that stand in for the "t": blades up, handles down, crossed
 * by the letter's bar at x-height. The scissors are amber, the one accent;
 * the bar belongs to the lettering and takes its colour.
 *
 * Drawn in units of 1/100 em with the baseline at y = 92, so it sits on the
 * line of the serif text around it at any size. `bar` is off where the
 * scissors stand alone, as the icon.
 */
export function Scissors({ bar = true, className = "", style }: {
  bar?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return (
    // Alone, the view is cropped to the drawing so it centres in a tile.
    <svg viewBox={bar ? "0 0 38 112" : "0 14 38 97"} className={className} style={style}
         fill="none" stroke="currentColor" aria-hidden="true">
      {/* the letter's bar, behind the blades */}
      {bar && <path d="M4.5 48 H37" strokeWidth="2.6" />}
      <g className="text-amber">
        {/* blades, meeting at the pivot */}
        <path d="M17.8 71 L12.9 17 L16.6 19 L21.6 65.5 Z" fill="currentColor" stroke="none" />
        <path d="M20.4 71 L26.6 17 L22.9 19 L16.8 65.5 Z" fill="currentColor" stroke="none" />
        {/* shanks, down to the rings */}
        <path d="M18.4 70 C 17.6 75, 14 78, 11.6 81.6" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M19.8 70 C 20.6 75, 23 78, 24.6 81.6" strokeWidth="2.6" strokeLinecap="round" />
        {/* finger rings */}
        <ellipse cx="9.4" cy="95" rx="5.6" ry="13.6" strokeWidth="2.7" transform="rotate(8 9.4 95)" />
        <ellipse cx="26.2" cy="95" rx="6.4" ry="12.8" strokeWidth="2.7" transform="rotate(-6 26.2 95)" />
        {/* the screw */}
        <circle cx="19.1" cy="69" r="1.9" fill="var(--color-ground)" strokeWidth="1.3" />
      </g>
    </svg>
  );
}

/** The wordmark: "sar", scissors for the "t", "oria". */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <p className="m-0 whitespace-nowrap font-serif font-normal text-chalk"
       style={{ fontSize: size, lineHeight: 1 }} aria-label="sartoria">
      <span aria-hidden="true">sar</span>
      <Scissors className="inline-block"
                style={{ height: "1.12em", width: "0.38em", verticalAlign: "-0.2em",
                         margin: "0 0.01em" }} />
      <span aria-hidden="true">oria</span>
    </p>
  );
}

/** The icon: the scissors alone, on a dark tile. Shown wherever the wordmark
 *  is not. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div className="relative grid flex-none place-content-center overflow-hidden
                    bg-ground-deep text-chalk"
         style={{ width: size, height: size, borderRadius: Math.round(size / 4),
                  outline: "1px solid rgba(240,231,217,.12)" }}
         role="img" aria-label="sartoria">
      <Scissors bar={false} style={{ height: size * 0.8, width: size * 0.8 * 38 / 97 }} />
    </div>
  );
}

/** The logo in its corner, on every screen after Welcome. */
export function CornerLogo() {
  return (
    <div className="absolute right-6 top-6 z-10">
      <Logo size={34} />
    </div>
  );
}

export function euro(n: number) {
  return `€${n}`;
}

/**
 * What happens to the recording, before it is made.
 *
 * A notice and not a tick. The measurement is the thing the customer asked
 * for, so the basis for processing it is the request itself, not consent —
 * and a consent box you cannot proceed without is not freely given anyway.
 * Consent is kept for the one purpose that genuinely needs it, which is
 * writing to somebody afterwards.
 *
 * Short by default because a notice nobody reads protects nobody, and the
 * three facts that actually matter fit in a sentence: not kept, not shown to
 * anyone, measured and discarded.
 */
export function PrivacyNote({ detail }: { detail?: boolean }) {
  return (
    <details className="group pt-3" open={detail}>
      <summary className="cursor-pointer list-none text-[11.5px] leading-[1.5] text-faint
                          hover:text-chalk">
        Your video is measured and discarded. We never store it.
        <span className="pl-1 underline underline-offset-2 group-open:hidden">
          What that means
        </span>
      </summary>
      <div className="space-y-2 pt-2.5 text-[11.5px] leading-[1.55] text-faint">
        <p>
          The recording is sent to be measured, turned into nine numbers, and
          deleted as soon as that finishes. It is not saved, not attached to
          your name, and nobody looks at it.
        </p>
        <p>
          The measuring runs on servers in Europe. Because the file is larger
          than the platform keeps in one place, it passes through storage in
          the United States on the way, under that provider&apos;s standard
          data protection clauses.
        </p>
        <p>
          The only thing you type is your height, and it is used to turn the
          picture into centimetres. We ask for nothing else, and we keep
          nothing after you close this.
        </p>
      </div>
    </details>
  );
}
