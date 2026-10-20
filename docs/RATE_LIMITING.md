# API rate-limiting behavior

CYRUS applies an in-process rolling 60-second request limit to `POST /api/execute`.

## Runtime behavior

- `CYRUS_EXECUTIONS_PER_MINUTE` defaults to 12 and is clamped to the range 1–120.
- Requests are grouped by Flask's `request.remote_addr` value. Rejected requests return HTTP 429 and a `Retry-After` value.
- The limiter keeps at most 1,000 distinct address keys. When a new key arrives at capacity, expired entries are pruned first; if all tracked keys are active, the untracked address is rejected for 60 seconds rather than growing the in-memory map.
- Existing tracked addresses continue to use their own rolling-window counters even when the key map is full.

## Deployment limits

This limiter is process-local and resets when the process restarts. It is not a distributed quota across multiple workers or multiple service instances. For multi-instance production deployments, use a shared atomic limiter (for example, a managed Redis-compatible store) and key it using the actual client address supplied by a trusted proxy configuration.

Do not trust arbitrary `X-Forwarded-For` values as client identities. A reverse proxy must be explicitly configured as trusted before proxy-supplied client-address headers are used. If multiple users share one apparent source IP, they share the same in-memory bucket.

## Tests

`tests/test_rate_limit_bounds.py` covers address churn, the hard key ceiling, stale-entry cleanup, existing-client behavior at capacity, per-client rolling-window enforcement, and the missing-address fallback. Run it with:

```powershell
python -m unittest tests.test_rate_limit_bounds -v
```
