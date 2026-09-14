/**
 * The one place the engine is chosen.
 *
 * When the spike returns a verdict and the Python pipeline is wrapped behind an
 * API route, only this file changes: swap `createStubEngine` for the real
 * client. Nothing in components/ imports anything else from engine/ except the
 * types.
 */
import { createStubEngine, type Scenario } from "./stub";
import { sizeCalculator } from "./advisor";
import type { MeasurementEngine, SizeCalculator } from "./types";

export function getEngine(scenario: Scenario = "ok"): MeasurementEngine {
  return createStubEngine(scenario);
}

/** Real arithmetic, not a stub — and deliberately never an LLM. */
export const calculator: SizeCalculator = sizeCalculator;

export type { Scenario };
export * from "./types";
