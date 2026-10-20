"""Non-executing static checks for CYRUS-generated draft artifacts.

This module parses source text but never imports, evaluates, or executes generated code.
"""
import ast
import re


MAX_DRAFT_CHARS = 18_000
PYTHON_FENCE = re.compile(r"```(?:python|py)\s*\n(.*?)\n```", re.IGNORECASE | re.DOTALL)
OPEN_FENCE = re.compile(r"```")


def analyze_draft(implementation: str) -> dict:
    source = implementation if isinstance(implementation, str) else ""
    checks = []

    def add(name, status, detail):
        checks.append({"name": name, "status": status, "detail": detail[:300]})

    add(
        "draft_present",
        "PASS" if bool(source.strip()) else "FAIL",
        "Implementation draft is non-empty." if source.strip() else "Draft is empty.",
    )
    add(
        "draft_size_limit",
        "PASS" if len(source) <= MAX_DRAFT_CHARS else "FAIL",
        f"Draft has {len(source)} characters; limit is {MAX_DRAFT_CHARS}.",
    )

    fences = OPEN_FENCE.findall(source)
    if len(fences) % 2:
        add("markdown_code_fences", "FAIL", "Draft contains an unmatched Markdown code fence.")
    else:
        add("markdown_code_fences", "PASS", f"Found {len(fences) // 2} balanced fenced code block(s).")

    python_blocks = PYTHON_FENCE.findall(source)
    syntax_failures = 0
    syntax_details = []
    for index, block in enumerate(python_blocks, 1):
        try:
            ast.parse(block)
        except SyntaxError as exc:
            syntax_failures += 1
            syntax_details.append(f"Python block {index}: syntax error near line {exc.lineno}.")
    if not python_blocks:
        add("python_syntax", "SKIP", "No fenced Python block was found; no Python syntax assertion was possible.")
    elif syntax_failures:
        add("python_syntax", "FAIL", " ".join(syntax_details[:4]))
    else:
        add("python_syntax", "PASS", f"Parsed {len(python_blocks)} fenced Python block(s) with ast.parse; none was executed.")

    secret_patterns = [
        ("OpenAI-style secret", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
        ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
        ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b")),
        ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
        ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
        ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
        ("bearer token", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}", re.IGNORECASE)),
        ("private key block", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ]
    secret_matches = [label for label, pattern in secret_patterns if pattern.search(source)]
    add(
        "likely_secret_scan",
        "FAIL" if secret_matches else "PASS",
        "Potential secret pattern found: " + ", ".join(secret_matches) + "."
        if secret_matches else "No common high-confidence secret patterns found in the draft.",
    )

    dangerous_calls = re.findall(r"\b(?:eval|exec)\s*\(|\bos\.system\s*\(|\bsubprocess\.(?:run|Popen|call)\s*\(", source)
    add(
        "execution_primitive_review",
        "WARN" if dangerous_calls else "PASS",
        "Draft contains dynamic/process execution primitives; review before running."
        if dangerous_calls else "No common dynamic/process execution primitive pattern detected.",
    )

    passed = sum(item["status"] == "PASS" for item in checks)
    failed = sum(item["status"] == "FAIL" for item in checks)
    warnings = sum(item["status"] in {"WARN", "SKIP"} for item in checks)
    return {
        "status": "FAILED" if failed else "COMPLETED_WITH_WARNINGS" if warnings else "COMPLETED",
        "checks": checks,
        "checks_passed": passed,
        "checks_failed": failed,
        "checks_warning": warnings,
        "python_blocks_checked": len(python_blocks),
        "code_executed": False,
        "limitations": [
            "Static parsing is not runtime testing.",
            "Python code is parsed with ast.parse and is never executed.",
            "No application test suite or test coverage measurement was run.",
        ],
    }
