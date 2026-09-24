"use client";

import { forwardRef, type ReactNode } from "react";

/** On a phone the app is the whole screen. On a desktop — where it will be
 *  demonstrated — it sits in a phone so the proportions stay honest.
 *
 *  The ref is the phone itself: the needle transition works in its local
 *  coordinates, whatever size it is rendered at. */
export const Frame = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function Frame({ children }, ref) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ground sm:p-8">
        <div ref={ref}
             className="relative h-dvh w-full overflow-hidden bg-ground text-chalk
                        sm:h-[812px] sm:max-h-[92vh] sm:w-[375px] sm:rounded-[40px]
                        sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)]
                        sm:outline sm:outline-1 sm:outline-chalk/8">
          {children}
        </div>
      </main>
    );
  });
