# Architecture

The browser selects a synthetic engine by default. A configured engine URL enables
an HTTP adapter implementing the same interface. The size advisor then compares
measurements to fictional catalogue charts; it does not call an LLM.

Two optional routes do, and neither can change a size. `/api/tailor` reads a
typed answer on the fitting ticket. `/api/advisor` is the Fit Advisor: an agent
(`web/lib/fitAdvisor/`) that, when the customer opens "Why this size?", calls
deterministic tools — `run_fit_engine` (the same calculator), `check_size`,
`pair_details`, `measurement_sources` — and writes a short explanation. The
paragraph is shown only if it names the calculator's size and every number and
size label in it came back from one of those tool calls (`verify.ts`); otherwise
the screen keeps the calculator's fixed sentences. With `FIT_ADVISOR_DEMO=1` and
no key, a template stand-in (`demo.ts`) plays the model's part in the same loop,
through the same check, and the screen labels it as not written by AI.

The real measurement path has four layers:

1. `spike/serve.py` checks authorisation, video format and typed height.
2. `modal_app.py` starts a GPU job and returns its ID. The API adds a result
   capability bound to that ID and the exact submission token.
3. `spike/nlf.py` adapts model predictions to named landmarks; `spike/mesh.py`
   performs geometry, and `spike/pipeline_smpl.py` reconciles per-frame estimates.
4. The browser polls with both tokens. The server checks them before retrieving
   any job output, and `web/lib/engine/contract.ts` validates the result shape.

The model's skeleton is represented in `spike/skeleton.py`; geometry should not
assume a provider's joint numbering. Preserve this seam when trying other models.
No model weights are needed for unit tests. Synthetic mathematical shapes test
geometry independently of inference accuracy.

The original package name `spike` is retained to avoid breaking imports and the
Modal source mount during source cleanup. It describes prototype maturity, not
an intended public package API.
