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

def test_environment_example_has_real_lines_and_a_development_default():
    root = Path(__file__).resolve().parents[2]
    example = root / ".env.example"
    content = example.read_text(encoding="utf-8")

    # Catch accidentally escaped line breaks that turn multiple variables into
    # one comment and silently remove the intended local environment setting.
    assert "\\n" not in content

    from dotenv import dotenv_values

    assert dotenv_values(example).get("CYRUS_ENVIRONMENT") == "development"

