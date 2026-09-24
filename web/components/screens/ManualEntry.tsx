"use client";

import { useState, type ReactNode } from "react";
import { Body, Button, CornerLogo, Eyebrow, Footer, Note, Screen, Title } from "@/components/ui";
import { MANUAL_RANGE, manualIsValid, type ManualInput } from "@/lib/engine/manual";

const FIELDS: { key: keyof ManualInput; label: string; how: string }[] = [
  { key: "waist", label: "Waist", how: "Around your natural waist, just above the navel." },
  { key: "hip", label: "Seat", how: "Around the fullest part of your hips." },
  { key: "inseam", label: "Inseam", how: "From the crotch down to the ankle bone." },
];

/** Measurements or a pair you own — the two ways in that need no video. */
export function NoVideoSwitch({
  value, onChange,
}: { value: "measurements" | "owned"; onChange: () => void }) {
  const opts = [["measurements", "My measurements"], ["owned", "A pair I own"]] as const;
  return (
    <div role="tablist" className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-surface p-1">
      {opts.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v}
                onClick={() => value !== v && onChange()}
                className={`rounded-full py-2 text-[12.5px] font-semibold transition
                  ${value === v ? "bg-surface-2 text-chalk"
                                : "text-mute hover:text-chalk"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ManualEntry({
  onDone, onBack, switcher, logoHidden = false,
}: {
  onDone: (m: ManualInput) => void; onBack: () => void; switcher?: ReactNode;
  /** While the needle is still flying into the corner. */
  logoHidden?: boolean;
}) {
  const [raw, setRaw] = useState<Record<keyof ManualInput, string>>({
    waist: "", hip: "", inseam: "",
  });

  const parsed: Partial<ManualInput> = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v.trim() ? Number(v.replace(",", ".")) : undefined]),
  );
  const valid = manualIsValid(parsed);

  const outOfRange = (k: keyof ManualInput) => {
    const v = parsed[k];
    if (v === undefined) return false;
    const [lo, hi] = MANUAL_RANGE[k];
    return !Number.isFinite(v) || v < lo || v > hi;
  };

  return (
    <Screen>
      <CornerLogo hidden={logoHidden} />
      <Body>
        <button type="button" onClick={onBack}
                className="pt-[22px] text-[12.5px] text-mute hover:text-chalk">
          ← Back
        </button>

        {switcher}

        <Eyebrow>With a tape measure</Eyebrow>
        <Title>Type in your <em>measurements.</em></Title>
        <p className="pt-3.5 text-[14px] leading-[1.5] text-mute">
          Measure your body, not a pair of jeans. Keep the tape snug but not tight.
        </p>

        <div className="space-y-3 pt-7">
          {FIELDS.map(({ key, label, how }) => (
            <label key={key} className="block rounded-[18px] bg-surface px-5 py-4
                                       ">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[14px] font-semibold text-chalk">{label}</span>
                <span className="flex items-baseline gap-1.5">
                  <input type="text" inputMode="decimal" value={raw[key]}
                         aria-label={`${label} in centimetres`}
                         placeholder="—"
                         onChange={(e) => setRaw((r) => ({ ...r, [key]: e.target.value }))}
                         className={`figure w-20 bg-transparent text-right text-[24px]
                                     font-semibold leading-none outline-none
                                     placeholder:text-faint
                                     ${outOfRange(key) ? "text-rust" : "text-chalk"}`} />
                  <span className="text-[13px] text-mute">cm</span>
                </span>
              </div>
              <p className="pt-1.5 text-[11.5px] leading-[1.45] text-faint">{how}</p>
              {outOfRange(key) && (
                <p className="pt-1 text-[11.5px] text-rust">
                  Between {MANUAL_RANGE[key][0]} and {MANUAL_RANGE[key][1]} cm, please.
                </p>
              )}
            </label>
          ))}
        </div>

        <div className="pt-4 pb-2">
          <Note>
            The thigh, knee and calf are estimated from your seat. They only
            colour how the jeans will sit, never which size we suggest.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button disabled={!valid} onClick={() => valid && onDone(parsed)}>
          Show me jeans that fit
        </Button>
      </Footer>
    </Screen>
  );
}
