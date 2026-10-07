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
        return [
            "REST contract validation",
            "JWT boundary review",
            "SQL persistence pattern",
            "Automated test strategy",
        ]


def get_provider() -> ExecutionProvider:
    # The current portfolio runtime deliberately remains deterministic.
    # A future OpenAI-compatible implementation can satisfy the same protocol
    # without changing the orchestration graph.
    return DeterministicProvider()
