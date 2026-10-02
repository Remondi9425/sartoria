# Optional research deployment

The local demo needs no cloud service. The real engine is an optional research
integration with NLF/SMPL restrictions; read THIRD_PARTY_NOTICES.md first.

## Configure the engine

Install locked Python dependencies with `uv sync --locked` and authenticate to your
own Modal account using its CLI. Generate a secret locally, for example with
`python -c 'import secrets; print(secrets.token_urlsafe(32))'`. Do not commit it.
Create a Modal secret named `sartoria-token` with `SARTORIA_TOKEN_SECRET` using the
Modal dashboard. Configure the same value in the frontend's server environment.

Set `SARTORIA_ENV=production` and `SARTORIA_ALLOWED_ORIGINS` to your frontend origin
before running `uv run modal deploy modal_app.py`. The deployment defaults to
production; it does not enable unauthenticated development. A missing or blank
secret prevents API startup. Set `SARTORIA_VERCEL_PROJECT` only if preview-origin
matching is needed; explicit origins are preferable for a restricted service.

The model build downloads about 493 MB of weights and uses a T4 GPU at runtime.
Runtime CPU dependencies come from `requirements-runtime.txt`, exported from
`uv.lock`. Torch/torchvision are separately pinned for the existing CUDA/model
integration. No GPU inference or deployment is performed by ordinary CI.

## Configure the frontend

Copy `web/.env.example` to `web/.env.local` for local testing. Configure
`NEXT_PUBLIC_ENGINE_URL` with **your** deployment URL and `SARTORIA_TOKEN_SECRET`
with the matching secret. Rebuild after changing the URL: public variables are
bundled at build time. Set `SARTORIA_ENV=production` on the hosted frontend.

Deploy the updated API and client as a coordinated change. The API returns
`result_token` alongside `job_id`; polls need the original Bearer token and the
`X-Sartoria-Result-Token` header. Capabilities expire and cannot be used for another
job or with another submission token. Existing clients lacking this header must
be upgraded. Debug submissions use the same protocol.

For isolated local API development only, set both `SARTORIA_ENV=dev` and
`SARTORIA_ALLOW_INSECURE_DEV=1` to allow an absent secret. On the frontend this also
requires the Next.js development server. Do not expose that configuration publicly.

## Optional Fit Advisor

"Why this size?" can add a paragraph written by Claude (`/api/advisor`). Every
time a customer opens it on a new pair, that is a paid run of a few model
calls. It is off unless the server has both `FIT_ADVISOR_ENABLED=1` and
`ANTHROPIC_API_KEY`; the key alone, which the tailor's route also uses, does not
switch it on. Set `FIT_ADVISOR_ENABLED=0` or remove it to turn the advisor off
and keep the tailor.

What bounds the cost:

- One run: at most three rounds of tool calls before the answer, and only the
  sizes near the chosen one are offered for comparison. Measured on
  `claude-opus-5-5` (`web/lib/model.ts`), a run is two or three calls and about
  4,700 input and 320 output tokens, in about 7 seconds.
- One page: an answer, or a failure, is kept in memory for the pair, so
  opening the same pair again does not run it again.
- One instance: 20 runs per address per ten minutes and 200 runs per hour in
  total. Both counters live in one serverless instance and reset on a cold
  start, so they slow a loop down; they are not a quota.
- Everything: set a monthly spend limit on the Anthropic workspace that owns
  the key, in the Anthropic Console. It is the only limit that holds across
  every instance, and it also covers the tailor. Prefer a key used only by
  this deployment, so the limit means what it says.

## Public-service work still required

The source can be studied and run locally, but unrestricted scans incur GPU costs
and process personal data. The token endpoint intentionally does not implement a
user login. Add an operator-selected access policy and shared quotas before an
unrestricted launch. Configure a trusted proxy to set forwarding headers; do not
assume client-supplied IP headers are trustworthy. Validate provider retention,
regions and deletion procedures, and update the user-facing notice accordingly.

## Optional Supabase keepalive

The app does not depend on Supabase. The optional workflow is disabled unless the
repository variable `ENABLE_SUPABASE_KEEPALIVE` equals `true`. Set repository
variable `SUPABASE_URL` and secret `SUPABASE_PUBLISHABLE_KEY` for your own project.
It calls an existing `public.heartbeat()` RPC; it does not create schema or policies.
Leave it disabled if no such RPC is configured. Never substitute a service-role
key. This source preparation does not change the live Supabase project.
