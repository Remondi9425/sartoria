"use client";

import type { ReactNode } from "react";

/** On a phone the app is the whole screen. On a desktop — where it will be
 *  demonstrated — it sits in a phone so the proportions stay honest. */
export function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ground sm:p-8">
      <div className="relative h-dvh w-full overflow-hidden bg-ground text-chalk
                      sm:h-[812px] sm:max-h-[92vh] sm:w-[375px] sm:rounded-[40px]
                      sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)]
                      sm:outline sm:outline-1 sm:outline-chalk/8">
        {children}
      </div>
    </main>
  );
}
