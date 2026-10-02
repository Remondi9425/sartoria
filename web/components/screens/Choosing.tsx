"use client";

import { useMemo } from "react";
import { BackLink, Body, CornerLogo, Eyebrow, Screen, Title, euro } from "@/components/ui";
import { PRODUCTS } from "@/lib/catalog";
import { rankByNeeds, topPicks, type Need } from "@/lib/preferences";
import { calculator } from "@/lib/engine";
import type { DigitalTwin, Product } from "@/lib/engine/types";

/**
 * The size ledger: every pair, the size in that brand, and why it sits where
 * it does.
 *
 * The size is computed per product, because "W31" is not the same number in
 * two different brands — which is the whole point of the product. The ticket
 * only ever reorders: it cannot change a size, and it cannot hide a pair.
 *
 * When the ticket clearly favours one pair (or two or three, level), it is
 * named first, above the ledger, with the ticket's reasons. The ledger below
 * is unchanged: the pick is a reading of it, not a replacement.
 */
export function Choosing({
  twin, needs, onPick, onEdit,
}: {
  twin: DigitalTwin; needs: Need[];
  onPick: (p: Product) => void; onEdit: () => void;
}) {
  const rows = useMemo(
    () => rankByNeeds(PRODUCTS, needs)
      .map((r) => ({ ...r, fit: calculator.recommend(twin, r.product) })),
    [twin, needs]);
  const picks = useMemo(() => topPicks(rows, (r) => r.fit.size !== null), [rows]);

  return (
    <Screen>
      <CornerLogo />
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

        {picks.length > 0 && (
          <section className="mt-5 rounded-[14px] border border-amber/40 bg-surface px-4 pb-1 pt-3.5"
                   aria-label="Picked for your ticket">
            <p className="figure text-[9.5px] font-semibold tracking-[.16em] text-amber uppercase">
              {picks.length === 1 ? "For your ticket" : "For your ticket · equally good"}
            </p>
            {picks.map(({ product: p, reasons, fit }) => (
              <button key={p.id} type="button" onClick={() => onPick(p)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5
                                 border-b border-dashed border-chalk/14 py-3 text-left
                                 last:border-b-0 transition hover:bg-chalk/[.03]">
                <span className="block">
                  <span className="figure block text-[9.5px] font-medium tracking-[.14em] text-faint uppercase">
                    {p.brand}
                  </span>
                  <span className="block pt-[3px] font-serif text-[23px] leading-[1.1]">{p.name}</span>
                  <span className="block pt-[5px] text-[12px] leading-[1.4] text-mute">
                    Because: <span className="text-amber">{reasons.join(" · ")}</span>
                  </span>
                  <span className="block pt-[3px] text-[11.5px] leading-[1.4] text-faint">
                    {fit.headline}
                  </span>
                </span>
                <span className="block text-right">
                  <span className="figure block text-[26px] font-semibold leading-none">
                    {fit.size?.split(" ")[0]}
                  </span>
                  <span className="figure block pt-[5px] text-[11px] text-mute">
                    {euro(p.price_eur)}
                  </span>
                </span>
              </button>
            ))}
          </section>
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
                  {fit.size && (
                    <span className="figure block pt-[3px] text-[11px] text-mute">
                      {fit.size.split(" ")[1]}
                    </span>
                  )}
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
