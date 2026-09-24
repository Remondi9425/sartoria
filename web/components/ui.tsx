"use client";

import type { ReactNode, Ref } from "react";

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
 * The wordmark: "sart", a sewn button for the "o", "ria".
 *
 * The button carries a ref because the needle transition starts from its
 * centre — the needle is pulled out of it.
 */
export function Wordmark({
  size = 30, buttonRef,
}: { size?: number; buttonRef?: Ref<HTMLSpanElement> }) {
  const d = Math.round(size * 0.46);
  const hole = Math.max(2, Math.round(d * 0.2));
  const at = [Math.round(d * 0.25), Math.round(d * 0.55)];
  const cross = size >= 48;
  const bar = Math.round(14 * size / 64);
  return (
    <p className="m-0 whitespace-nowrap font-serif font-normal text-chalk"
       style={{ fontSize: size, lineHeight: 1 }} aria-label="SartorIA">
      <span aria-hidden="true">sart</span>
      <span ref={buttonRef} aria-hidden="true"
            className="relative inline-block rounded-full bg-amber"
            style={{ width: d, height: d, margin: "0 1px", verticalAlign: 0 }}>
        {at.flatMap((top) => at.map((left) => (
          <span key={`${left}-${top}`} className="absolute rounded-full bg-ground"
                style={{ left, top, width: hole, height: hole }} />
        )))}
        {cross && [45, -45].map((r) => (
          <span key={r} className="absolute bg-chalk"
                style={{ left: "50%", top: "50%", width: bar, height: 2,
                         transform: `translate(-50%,-50%) rotate(${r}deg)` }} />
        ))}
      </span>
      <span aria-hidden="true">ria</span>
    </p>
  );
}

/** The needle, as drawn in the icon and flown in the transition. */
export function Needle({ length, plain = false, style }: {
  length: number; plain?: boolean; style?: React.CSSProperties;
}) {
  return (
    <span className="absolute block bg-amber"
          style={{
            width: plain ? 2 : 3, height: length,
            clipPath: plain ? undefined : "polygon(0 0,100% 0,100% 88%,50% 100%,0 88%)",
            ...style,
          }}>
      {!plain && (
        <span className="absolute bg-ground-deep"
              style={{ left: 1, top: 3, width: 1, height: 5 }} />
      )}
    </span>
  );
}

/**
 * The icon: an italic S crossed by a needle, on a dark tile. Shown wherever
 * the wordmark is not.
 */
export function Logo({ size = 34, needle = true }: { size?: number; needle?: boolean }) {
  const L = Math.round(size * 0.92);
  const plain = size <= 24;
  return (
    <div className="relative flex-none overflow-hidden bg-ground-deep"
         style={{ width: size, height: size, borderRadius: Math.round(size / 4),
                  outline: "1px solid rgba(240,231,217,.12)" }}
         role="img" aria-label="SartorIA">
      <span className="absolute inset-0 grid place-content-center">
        <span className="font-serif italic text-chalk"
              style={{ fontSize: Math.round(size * 0.88), lineHeight: 1,
                       transform: "translateY(-1px)" }}>
          S
        </span>
      </span>
      {needle && (
        <Needle length={L} plain={plain}
                style={{ left: "50%", top: "50%",
                         transform: "translate(-50%,-50%) rotate(32deg)" }} />
      )}
    </div>
  );
}

/** The logo in its corner, on every screen after Welcome. Hidden while the
 *  needle is still flying into that corner. */
export function CornerLogo({ hidden = false }: { hidden?: boolean }) {
  if (hidden) return null;
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
