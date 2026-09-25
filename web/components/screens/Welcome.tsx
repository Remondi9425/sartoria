"use client";

import { useRef, useState } from "react";
import { CHALK, PointCloud } from "@/components/art/PointCloud";
import { mannequinCloud } from "@/components/art/bodyCloud";
import { Body, Button, Footer, Note, PrivacyNote, Screen, StubBadge, Wordmark } from "@/components/ui";
import { engineConfigured } from "@/lib/engine";

export function Welcome({
  onStart, onUseFile, onManual,
}: {
  onStart: (heightCm: number) => void;
  onUseFile: (heightCm: number, clip: File) => void;
  onManual: (heightCm: number) => void;
}) {
  const [height, setHeight] = useState(174);
  const file = useRef<HTMLInputElement>(null);
  const step = (d: number) => setHeight((h) => Math.min(210, Math.max(140, h + d)));

  return (
    <Screen>
      {/* The body the video will be turned into, turning behind the words. */}
      <div className="pointer-events-none absolute right-[-70px] top-[120px] h-[430px]
                      w-[270px] opacity-50">
        <PointCloud points={mannequinCloud()} tint={CHALK} turnSeconds={24}
                    className="h-full w-full" />
      </div>

      <Body className="relative flex flex-col">
        <div className="flex items-center justify-between gap-2.5 pt-7">
          <Wordmark size={30} />
          {!engineConfigured && <StubBadge />}
        </div>

        <h1 className="pt-[52px] font-serif text-[48px] leading-none font-normal
                       tracking-[-.01em]">
          Your size,<br />from one <em>video.</em>
        </h1>
        <p className="max-w-[240px] pt-4 text-[14.5px] leading-[1.5] text-pretty text-mute">
          Ten seconds of filming, then a short talk about how you wear them. No
          tape measure, no guessing between W30 and W32.
        </p>

        <p className="eyebrow pt-[30px] pb-3">How tall are you?</p>
        <div className="flex items-center justify-between rounded-[18px] border
                        border-chalk/8 bg-surface px-[22px] py-5">
          <p className="figure text-[38px] font-semibold leading-none">
            {height}<span className="pl-1.5 font-sans text-[14px] font-normal text-mute">cm</span>
          </p>
          <div className="flex gap-2.5">
            {([["−", -1], ["+", 1]] as const).map(([sign, d]) => (
              <button key={sign} type="button" onClick={() => step(d)}
                      aria-label={d > 0 ? "taller" : "shorter"}
                      className="h-11 w-11 rounded-full border border-chalk/20 text-xl
                                 leading-none text-chalk transition hover:bg-surface-2">
                {sign}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-3">
          <Note>It is what turns the video into centimetres.</Note>
        </div>

        {/* Three ways in, centred in whatever room is left. */}
        <div className="flex flex-1 flex-col justify-center gap-3 py-7">
          <Button onClick={() => onStart(height)}>Film a video</Button>
          <Button variant="outline" onClick={() => file.current?.click()}>
            Upload a video
          </Button>
          <Button variant="outline" onClick={() => onManual(height)}>
            Enter measurements or size
          </Button>
          <input ref={file} type="file" accept="video/*" className="hidden"
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   if (f) onUseFile(height, f);
                 }} />
        </div>
      </Body>

      <Footer>
        <PrivacyNote />
      </Footer>
    </Screen>
  );
}
