from dataclasses import dataclass
from typing import Protocol


class ExecutionProvider(Protocol):
    name: str
    mode: str
    status: str

    def plan(self, objective: str) -> list[str]:
        ...

    def research(self, objective: str) -> list[str]:
        ...


@dataclass(frozen=True)
class DeterministicProvider:
    name: str = "deterministic"
    mode: str = "DEMO"
    status: str = "ready"

    def plan(self, objective: str) -> list[str]:
        words = [w.strip(".,:;()[]{}") for w in objective.split() if len(w) > 4]
        focus = ", ".join(words[:5]) if words else "engineering objective"
        return [
            f"Clarify acceptance criteria around {focus}",
            "Design the service boundary and request flow",
            "Implement validation, persistence and API behavior",
            "Create automated verification and failure paths",
            "Review security, reliability and maintainability",
            "Prepare a release manifest and delivery summary",
        ]

    def research(self, objective: str) -> list[str]:
        text = objective.lower()
        signals = []
        if any(token in text for token in ("api", "rest", "http", "endpoint")):
            signals.append("REST contract validation")
        if any(token in text for token in ("auth", "jwt", "login", "token", "permission")):
            signals.append("Authentication and authorization boundary review")
        if any(token in text for token in ("sql", "database", "postgres", "mysql", "sqlite", "persistence")):
            signals.append("Persistence and transaction pattern review")
        if any(token in text for token in ("test", "qa", "quality", "coverage")):
            signals.append("Automated verification strategy")
        if any(token in text for token in ("deploy", "release", "docker", "cloud")):
            signals.append("Deployment and rollback readiness")
        if any(token in text for token in ("security", "secure", "secret", "vulnerability")):
            signals.append("Security boundary and secret-handling review")
        defaults = [
            "Failure-mode and observability review",
            "Maintainability and dependency-risk review",
        ]
        return (signals + defaults)[:6]


def get_provider() -> ExecutionProvider:
    # The current portfolio runtime deliberately remains deterministic.
    # A future OpenAI-compatible implementation can satisfy the same protocol
    # without changing the orchestration graph.
    return DeterministicProvider()
