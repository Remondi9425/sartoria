"use client";

import { Jeans } from "@/components/art/Jeans";
import { Body, Button, CornerLogo, Footer, Note, Screen, Title, euro } from "@/components/ui";
import type { FitRecommendation, Product } from "@/lib/engine/types";

/** No card fields anywhere. A saved-card row is what the real flow shows too —
 *  the card itself belongs to the payment provider's embedded component, and it
 *  never touches this app. Here it is a demo placeholder and nothing is sent. */
export function Checkout({
  product, colourId, fit, onPlace, onBack,
}: {
  product: Product; colourId: string; fit: FitRecommendation;
  onPlace: () => void; onBack: () => void;
}) {
  const colour = product.colours.find((c) => c.id === colourId) ?? product.colours[0];

  return (
    <Screen>
      <CornerLogo />
      <Body>
        <button type="button" onClick={onBack}
                className="pt-[22px] text-[12.5px] text-mute hover:text-chalk">
          ← Back
        </button>

        <p className="eyebrow pt-4 pb-2.5">{product.brand} · through SartorIA</p>
        <Title><em>Checkout.</em></Title>

        <div className="mt-5 flex items-center gap-4">
          <div className="w-16 shrink-0 rounded-lg bg-surface py-2">
            <Jeans denim={colour.denim} fit={product.fit} className="mx-auto h-16" />
          </div>
          <div className="flex-1">
            <p className="font-serif text-[19px] leading-[1.1]">{product.name}</p>
            <p className="pt-0.5 text-[11.5px] text-mute">
              {colour.name.toLowerCase()} · size{" "}
              <span className="figure font-semibold text-chalk">{fit.size}</span>
            </p>
          </div>
          <p className="figure text-[14px] font-semibold">{euro(product.price_eur)}</p>
        </div>

        <dl className="mt-6 space-y-3 border-t border-chalk/10 pt-5 text-[13px]">
          {[["Delivery", "Free · Thu 11 Sep"], ["Returns", "30 days, free"]].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-mute">{k}</dt>
              <dd className="figure">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-chalk/10 pt-4 text-[16px] font-semibold">
            <dt>Total</dt>
            <dd className="figure">{euro(product.price_eur)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex items-center justify-between rounded-xl border
                        border-chalk/10 bg-surface px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="h-6 w-9 rounded bg-chalk/20" />
            <span className="text-[13px]">Card ending 6411</span>
          </div>
          <span className="text-[12.5px] text-mute">Change</span>
        </div>

        <div className="mt-3 rounded-xl bg-surface px-4 py-3.5">
          <p className="text-[11.5px] leading-[1.55] text-mute">
            The shop receives your size. It never receives your measurements.
          </p>
        </div>

        <div className="pb-2" />
      </Body>

      <Footer>
        <Button onClick={onPlace}>Place order · {euro(product.price_eur)}</Button>
        <div className="pt-3 text-center">
          <Note>
            Demo only — nothing is charged and no card details are collected.
            You will get one question after delivery. Nothing else.
          </Note>
        </div>
      </Footer>
    </Screen>
  );
}
