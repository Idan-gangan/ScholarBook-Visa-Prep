# Provider cost tracking

This change improves per-student cost evidence. It does not reconstruct missing history or establish an exact invoice allocation.

## Collection and privacy

A read-only server WebSocket observes each Realtime call before the SDP answer is handed to the browser. Response usage and separate input-transcription usage are captured. Text report, review and practice requests have a pending record before the network call. Provider usage survives malformed report content. Retries deduplicate by hashed provider identifier within the request/session.

Stored data contains pseudonymous attribution, numeric counters, model, service tier, rate version and timestamps. It excludes transcripts, prompts, audio, raw provider IDs and credentials. Records inherit the existing 30-day diagnostics retention and deletion cascades. Export regularly if a longer accounting history is needed.

Missing events, interrupted observers, unknown models, unsupported tiers and missing price counters remain visibly incomplete/unpriced. A browser estimate is never added to the overlapping provider subtotal. Collection failures do not block practice; fixed-code warnings appear in application logs. Database insertion failures can prevent even an attempt record from being saved, so these logs need operational monitoring. No reconnect/backfill is promised.

## Rates

The versioned standard rate table is valid November 13–30, 2026. After expiry counters continue to be collected but new costs remain unpriced pending a rate review. This avoids silently extending promotional prices. Current code handles gpt-realtime-2.1, duration-based gpt-transcribe, and gpt-5.6-sol/gpt-5.6 text usage including cache writes and long prompts. Unknown snapshots remain unpriced.

Sources checked November 13, 2026:
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/models/gpt-transcribe
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/guides/realtime-server-controls

## Compare with provider billing

An authenticated owner can download `/api/owner/cost-export?start=2026-11-13T00:00:00.000Z&end=2026-11-14T00:00:00.000Z`. The interval is inclusive start/exclusive end, at most 31 days; only retained records are available. Use completed UTC days and allow provider billing to settle. The export has aggregate model/category totals, not student identities.

Independently obtain the provider's complete project billing total for precisely that interval. Verify project scope: shared API projects can contain unrelated usage. Do not paste API keys into chat or commit them. Normalize the verified statement into this local JSON (the number below is only an example):

```json
{"start":"2026-11-13T00:00:00.000Z","end":"2026-11-14T00:00:00.000Z","currency":"USD","project":"your-project-id","complete":true,"total_usd":"0.30"}
```

Run `node scripts/compare-provider-costs.cjs ledger.json billing.json`. The offline tool validates dates/currency/completeness declarations and compares decimal totals. It cannot independently authenticate the statement or project scope. It reports the difference without distributing it among students. Invoice credits, taxes, billing lag and unrelated usage must be investigated separately. Even matching totals do not prove each student's allocation is complete.

## Rollout validation

Before release, run `node --test test/*.test.cjs`. Additive tables are created during normal initialization. After deploying, complete one tutor call and one mock/report on an authorized test account; check provider event counts, clean observer closure, text/transcription counters, unknown-price flags and owner-only export access. Compare against the provider's settled statement. Live provider capture has not been validated by the offline suite.

Do not switch customer billing to live mode as part of this change. Keep the existing billing test branch separate. Roll back by reverting the code commit; additive tables may remain. Existing browser estimates remain available for comparison.
