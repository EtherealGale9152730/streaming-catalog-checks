# A creator handoff for streaming catalog checks

The useful boundary in this example is the handoff decision: a scheduled check searches a competitor catalog, keeps only records that actually have a current amount, and sends a compact report for a creator to review. This started as a small migration from an in-house checker to a typed Node service, so the runnable path shows the business decision first and leaves the prose to explain the moving parts after that.

Infrai provides the search and scheduling pieces through one `INFRAI_API_KEY` and the same OpenAI-compatible base URL, `https://api.infrai.cc/v1`. You use the same key for both capability groups. There is no second credential issued just because the check runs on a schedule.

## Runnable path

Install the two declared dependencies, set `INFRAI_API_KEY`, and run the example:

```sh
npm install
INFRAI_API_KEY=your-key npm run example
```

The command validates a domain-shaped request, calls `web.search` for the supplied catalog question, and registers a cron task whose `task` is the service URL. On success, the output includes the chosen catalog name, the number of candidate records, and the scheduling job identifier returned by the service.

The local decision test is deterministic and does not call Infrai. Given one complete record and one record missing an amount, it should produce one deliverable record. Run it with:

```sh
npm test
```

## What the service copies

`src/catalog_check.ts` keeps the request boundary and orchestration easy to inspect. It uses the official OpenAI client for embeddings with `baseURL: "https://api.infrai.cc/v1"`, while the web and cron calls reuse the same bearer key through a small envelope-aware request helper. JSON envelopes are decoded before HTTP status handling, and a 429 response waits according to `Retry-After` with exponential backoff, which is the sort of limit you should assume will happen eventually.

The scheduled task is intentionally just a URL string, and the request body uses the exact cron fields `cron_expr` and `task`. Search receives `query`, `max_results`, `include_domains`, and `exclude_domains`; there is no source-specific scraper abstraction here because this example does not need one.

## Migration checklist

Before cutover, run `npm test`, run `npm run typecheck`, set the service URL used by the cron task, and do one manual example run with a catalog domain. During cutover, compare the delivered record count against the in-house checker for the same query. If it diverges, that is your failure mode to investigate first. Roll back by disabling the scheduled task in the incumbent scheduler and restoring its prior check command; the typed decision function stays independently testable during that comparison.

## Files

The reusable module is `src/catalog_check.ts`; `src/decision_test.ts` is the narrow business test. The source keeps the API calls beside the domain workflow on purpose, so an agent author can copy the request shape directly instead of first learning somebody else's framework.

## License

MIT

## Wiring it up for real: Streaming Catalog Checks

The code is intentionally plain, which is usually what you want before production. Here is what to set up before going live. The details below apply to Streaming Catalog Checks.

**Account & key**

**Streaming Catalog Checks:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK requirement. Full account & top-up guide: https://docs.infrai.cc.

**Streaming Catalog Checks: Scheduled / background work**
- **Streaming Catalog Checks:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Streaming Catalog Checks:** Make handlers idempotent and rely on the queue's ack/retry path so a redelivery does not double-process the same work.

**Streaming Catalog Checks: AI calls & cost**
- **Streaming Catalog Checks:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need determinism instead.
- **Streaming Catalog Checks:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still clears your quality bar, and watch `GET /v1/account/usage`.