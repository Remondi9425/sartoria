"use client";

import { useMemo } from "react";
import { BackLink, Body, CornerLogo, Eyebrow, Screen, Title, euro } from "@/components/ui";
import { PRODUCTS } from "@/lib/catalog";
import { rankByNeeds, type Need } from "@/lib/preferences";
import { calculator } from "@/lib/engine";
import type { DigitalTwin, Product } from "@/lib/engine/types";

/**
 * The size ledger: every pair, the size in that brand, and why it sits where
 * it does.
 *
 * The size is computed per product, because "W31" is not the same number in
 * two different brands — which is the whole point of the product. The ticket
 * only ever reorders: it cannot change a size, and it cannot hide a pair.
 */
export function Choosing({
  twin, needs, onPick, onEdit, logoHidden = false,
}: {
  twin: DigitalTwin; needs: Need[];
  onPick: (p: Product) => void; onEdit: () => void; logoHidden?: boolean;
}) {
  const rows = useMemo(
    () => rankByNeeds(PRODUCTS, needs)
      .map((r) => ({ ...r, fit: calculator.recommend(twin, r.product) })),
    [twin, needs]);

  return (
    <Screen>
      <CornerLogo hidden={logoHidden} />
      <Body className="!px-6 pb-5">
        <BackLink onClick={onEdit}>← Edit the ticket</BackLink>
        <Eyebrow>{PRODUCTS.length} charts · read against your numbers</Eyebrow>
        <Title>Your size, brand <em>by brand.</em></Title>

        {needs.length > 0 && (
          <p className="pt-3 text-[12px] leading-[1.5] text-mute">
            From your ticket:{" "}
            <span className="text-chalk">{needs.map((n) => n.label).join(" · ")}</span>
          </p>
        )}

        {/* A tape rule across the top of the ledger. */}
        <div className="mt-[18px] h-3.5" aria-hidden="true"
             style={{ background:
               "repeating-linear-gradient(90deg,rgba(240,231,217,.5) 0 1px,transparent 1px 40px) top/100% 14px no-repeat," +
               "repeating-linear-gradient(90deg,rgba(240,231,217,.25) 0 1px,transparent 1px 8px) top/100% 7px no-repeat" }} />

        <ol>
          {rows.map(({ product: p, reasons, fit }, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)}
                      className="grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-2.5
                                 border-b border-dashed border-chalk/14 py-3.5 text-left
                                 transition hover:bg-chalk/[.03]">
                <span className="figure pt-[3px] text-[11px] font-medium text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block">
                  <span className="figure block text-[9.5px] font-medium tracking-[.14em] text-faint uppercase">
                    {p.brand}
                  </span>
                  <span className="block pt-[3px] font-serif text-[21px] leading-[1.1]">{p.name}</span>
                  {reasons.length > 0 ? (
                    <span className="block pt-[5px] text-[11.5px] leading-[1.35] text-amber">
                      {reasons.join(" · ")}
                    </span>
                  ) : (
                    <span className="block pt-[5px] text-[11.5px] leading-[1.35] text-faint">
                      {p.fit[0].toUpperCase() + p.fit.slice(1)} · {p.composition}
                    </span>
                  )}
                </span>
                <span className="block text-right">
                  <span className="figure block text-[24px] font-semibold leading-none">
                    {fit.size?.split(" ")[0] ?? "—"}
                  </span>
                  <span className="figure block pt-[5px] text-[11px] text-mute">
                    {euro(p.price_eur)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <p className="pt-[18px] text-[11.5px] leading-[1.5] text-faint">
          W30 in one brand and W31 in the next is normal: each row is read from
          that brand&apos;s own chart.
        </p>
      </Body>
    </Screen>
  );
}
