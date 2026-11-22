# CI runtime and action maintenance

Last reviewed: 11 November 2026

The CI workflow is defined in `.github/workflows/ci.yml`.

## Runtime matrix

- Frontend build and Node test suite: Node.js 24 on `ubuntu-latest`.
- Backend tests and container checks: Python 3.12 on `ubuntu-latest`.
- Checkout credentials are not persisted after either job because the workflow performs no Git writes. The workflow has read-only repository permissions and runs on pushes to `main` (and on external pull-request events).

## Immutable action pins

The workflow pins each third-party action to a full commit SHA instead of a mutable major-version tag:

| Action | Release reference | Pinned commit | GitHub signature |
|---|---|---|---|
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Verified |
| `actions/setup-node` | `v7.1.0` | `949feb2413d6458794dcd2491c4babbbce0c15c1` | Verified |
| `actions/setup-python` | `v7.1.0` | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | Verified |

The pins above were resolved from the upstream GitHub repository's `commits/v7` references on 11 November 2026. GitHub's commit API reported `verification.verified=true` and `reason=valid` for each pinned commit.

When updating an action, resolve the intended upstream release to its full commit SHA, check the commit verification result, update this table, and keep the action input contract unchanged unless the workflow is deliberately migrated and tested.

## Node.js Actions runtime

GitHub's Node 20 Actions runtime deprecation notice was updated on 25 August 2026: Node 20 was removed from hosted runners on 23 September 2026. The workflow uses Node 24-compatible action releases and tests the frontend itself on Node 24.

## Official references

- [GitHub Actions Node 20 deprecation and removal notice](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [actions/checkout releases](https://github.com/actions/checkout/releases)
- [actions/setup-node releases](https://github.com/actions/setup-node/releases)
- [actions/setup-python releases](https://github.com/actions/setup-python/releases)
- [GitHub Actions secure use reference](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)

## Workflow result interpretation

Reviewed: 22 November 2026

The Delivery / CI workspace reads the public GitHub Actions workflow-runs endpoint. A completed run is classified by its conclusion, not by treating every completed run as a success.

- \`failure\`, \`timed_out\`, and \`startup_failure\` are grouped as failed runs in the summary and failure filter.
- \`startup_failure\` means a check suite or run failed at startup; it must not be shown as a pass or hidden in the generic “Other” filter.
- Unknown future states remain visible as “Unknown” / “Other” rather than being guessed to be successful.
- Workflow run IDs must be positive safe integers, and links must resolve to the canonical HTTPS GitHub origin and this repository's exact run path.

Official references:
- [GitHub REST API — list workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository)
- [GitHub REST API — using the Checks API](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)
- [GitHub GraphQL CheckConclusionState](https://docs.github.com/en/graphql/reference/checks#checkconclusionstate)

## Public Actions API rate-limit behavior

The CI history view is unauthenticated and read-only. GitHub can return primary rate-limit responses (403 with \`X-RateLimit-Remaining: 0\`) or secondary rate-limit responses (403/429 with \`Retry-After\`). The workspace reads only those response headers, never a token, and displays the available retry/reset interval. A 403 without rate-limit evidence remains a generic access error.

Reference: [GitHub REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
