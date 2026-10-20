# Provider adapter security

CYRUS can call an OpenAI Chat Completions-compatible endpoint when `CYRUS_LLM_API_KEY` is configured. The provider adapter is designed to fail safely when configuration is absent or the endpoint is unsafe.

## Endpoint validation

- Remote provider endpoints must use HTTPS.
- Plain HTTP is permitted only for the exact `localhost` host or an IP address recognized as loopback (for local development).
- URL user information, query strings, and fragments are rejected. Do not place credentials in URLs.
- Host validation parses the URL instead of checking a string prefix, so lookalike hosts such as `localhost.attacker.example` are rejected.
- Invalid endpoint configuration selects the deterministic demo provider and makes no live provider request.

## Response and error handling

- Each provider request has a bounded timeout configured by `CYRUS_LLM_TIMEOUT_SECONDS` (5–60 seconds).
- The response body is capped at 2,000,000 bytes before JSON parsing.
- HTTP error details and network exception messages are scrubbed for common authorization headers, bearer values, API-key assignments, token assignments, provider-style keys, AWS access-key identifiers, and private-key blocks.
- Scrubbing is heuristic, not a universal secret detector. Avoid sending secrets in prompt content and inspect provider diagnostics before sharing logs.
- Provider credentials are held in the server process and are not returned by the public provider-capabilities endpoint.

## Local verification

Run these commands from the repository root:

```powershell
python -m unittest discover -s tests -v
python -m compileall -q server.py providers.py static_analysis.py storage.py tests
```

The URL validation, error scrubbing, and response-size checks use mocked HTTP responses. They do not make live requests to a provider. Passing these tests establishes the tested client-side contract, not the availability or trustworthiness of any particular hosted model.
