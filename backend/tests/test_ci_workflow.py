from pathlib import Path
import re


def test_ci_pins_verified_actions_and_does_not_persist_checkout_credentials():
    workflow = (
        Path(__file__).resolve().parents[2]
        / ".github"
        / "workflows"
        / "ci.yml"
    ).read_text(encoding="utf-8")

    for action in ("checkout", "setup-node", "setup-python"):
        assert re.search(
            rf"actions/{action}@[0-9a-f]{{40}}",
            workflow,
        ), f"{action} must use a full immutable commit SHA"
    assert not re.search(r"actions/(?:checkout|setup-node|setup-python)@v\d+", workflow)
    assert workflow.count("persist-credentials: false") == 2
    assert "permissions:\n  contents: read" in workflow
    assert "node-version: 24" in workflow
    assert 'python-version: "3.12"' in workflow
