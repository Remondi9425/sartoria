"use client";

import { useState, type ReactNode } from "react";
import { Body, Button, CornerLogo, Eyebrow, Footer, Note, Screen, Title } from "@/components/ui";
import { BRANDS, chartFor, type BrandChart, type BrandName, type Line } from "@/lib/brands";

function Chips<T extends string | number>({
  options, value, onPick, label,
}: { options: T[]; value: T | null; onPick: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onPick(o)}
                className={`figure rounded-lg px-3 py-2 text-[12.5px] transition
                  ${value === o ? "bg-chalk text-ground" : "bg-surface text-mute hover:text-chalk"}`}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export function Wardrobe({
  onAnchor, onBack, switcher,
}: {
  onAnchor: (chart: BrandChart, w: number, l: number) => void;
  onBack: () => void; switcher?: ReactNode;
}) {
  const [brand, setBrand] = useState<BrandName | null>(null);
  const [line, setLine] = useState<Line>("men");
  const [w, setW] = useState<number | null>(null);
  const [l, setL] = useState<number | null>(null);

  const chart = brand ? chartFor(brand, line) : null;
  // A W or L that the newly chosen chart does not have is not kept.
  const pickChart = (b: BrandName, ln: Line) => {
    const c = chartFor(b, ln);
    setBrand(b); setLine(ln);
    if (w !== null && !c.sizes.some((s) => s.w === w)) setW(null);
    if (l !== null && !c.lengths.some((x) => x.l === l)) setL(null);
  };

  return (
    <Screen>
      <CornerLogo />
      <Body>
        <button type="button" onClick={onBack}
                className="pt-[22px] text-[12.5px] text-mute hover:text-chalk">
          ← Back
        </button>

        {switcher}

        <Eyebrow>No camera needed</Eyebrow>
        <Title>Which jeans that you own fit you <em>best?</em></Title>
        <p className="pt-3.5 text-[14px] leading-[1.5] text-mute">
          No tape measure to hand? Everybody knows which jeans they reach for
          first. Look at the label inside the waistband.
        </p>

        <p className="eyebrow pt-8 pb-2.5">The brand</p>
        <div className="grid grid-cols-3 gap-2">
          {BRANDS.map((b) => (
            <button key={b} type="button" onClick={() => pickChart(b, line)}
                    className={`rounded-xl border px-3 py-3 text-[13.5px] font-medium transition
                      ${brand === b
                        ? "border-chalk bg-surface" : "border-chalk/10 bg-surface hover:border-chalk/25"}`}>
              {b}
            </button>
          ))}
        </div>

        {brand && chart && (
          <>
            <p className="eyebrow pt-7 pb-2.5">Cut for</p>
            <Chips options={["men", "women"] as Line[]} value={line}
                   onPick={(ln) => pickChart(brand, ln)}
                   label={(ln) => (ln === "men" ? "Men" : "Women")} />

            <p className="eyebrow pt-6 pb-2.5">Waist on the label</p>
            <Chips options={chart.sizes.map((s) => s.w)} value={w}
                   onPick={setW} label={(v) => `W${v}`} />

            <p className="eyebrow pt-6 pb-2.5">Length on the label</p>
            <Chips options={chart.lengths.map((x) => x.l)} value={l}
                   onPick={setL} label={(v) => `L${v}`} />

            <p className="pt-3 text-[11px] leading-[1.5] text-faint">
              Read through {brand}&apos;s own size chart ({line === "men" ? "men" : "women"}).
            </p>
          </>
        )}

        <div className="pt-6 pb-2">
          <Note>
            This is weaker than a scan — a size fits a range of bodies, not one.
            We will say so on every recommendation that comes from it.
          </Note>
        </div>
      </Body>

      <Footer>
        <Button disabled={!chart || w === null || l === null}
                onClick={() => chart && w !== null && l !== null && onAnchor(chart, w, l)}>
          Use this pair
        </Button>
      </Footer>
    </Screen>
  );
}
