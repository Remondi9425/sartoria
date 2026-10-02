/**
 * The Claude model behind the two routes that call one: the tailor reading a
 * typed answer (`app/api/tailor`) and the Fit Advisor (`lib/fitAdvisor`).
 * One place, so they move together. Changing it changes cost, latency and
 * what the advisor writes: re-measure both before shipping (docs/deployment.md).
 */
export const MODEL = "claude-opus-5-5";
