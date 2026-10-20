import unittest

from static_analysis import analyze_draft


class DraftStaticAnalysisTests(unittest.TestCase):
    def test_valid_python_fence_is_parsed_without_execution(self):
        fence = chr(96) * 3
        source = "# Implementation draft\n" + fence + "python\ndef greet(name):\n    return 'hello ' + name\n" + fence
        result = analyze_draft(source)
        python_check = next(check for check in result["checks"] if check["name"] == "python_syntax")
        self.assertEqual(python_check["status"], "PASS")
        self.assertFalse(result["code_executed"])
        self.assertEqual(result["python_blocks_checked"], 1)
        self.assertGreater(result["checks_passed"], 0)

    def test_python_syntax_error_is_reported(self):
        fence = chr(96) * 3
        source = fence + "python\ndef broken(:\n    return 1\n" + fence
        result = analyze_draft(source)
        python_check = next(check for check in result["checks"] if check["name"] == "python_syntax")
        self.assertEqual(python_check["status"], "FAIL")
        self.assertGreater(result["checks_failed"], 0)

    def test_common_secret_patterns_are_flagged_without_echoing_secret(self):
        source = "API_KEY = 'sk-" + ("a" * 28) + "'"
        result = analyze_draft(source)
        secret_check = next(check for check in result["checks"] if check["name"] == "likely_secret_scan")
        self.assertEqual(secret_check["status"], "FAIL")
        self.assertNotIn("sk-", secret_check["detail"])

    def test_common_provider_tokens_are_flagged_without_echoing_values(self):
        values = [
            "ghp_" + "G" * 30,
            "github_pat_" + "H" * 35,
            "AIza" + "I" * 35,
            "xoxb-" + "S" * 24,
            "eyJ" + "a" * 12 + "." + "b" * 12 + "." + "c" * 12,
            "Bearer " + "T" * 28,
        ]
        result = analyze_draft(" ".join(values))
        check = next(item for item in result["checks"] if item["name"] == "likely_secret_scan")
        self.assertEqual(check["status"], "FAIL")
        for label in ("GitHub token", "Google API key", "Slack token", "JWT", "bearer token"):
            self.assertIn(label, check["detail"])
        for value in values:
            self.assertNotIn(value, check["detail"])
        self.assertFalse(result["code_executed"])

    def test_unbalanced_code_fence_is_flagged(self):
        result = analyze_draft("Draft with a fence " + chr(96) * 3 + "python")
        check = next(item for item in result["checks"] if item["name"] == "markdown_code_fences")
        self.assertEqual(check["status"], "FAIL")

    def test_dynamic_execution_primitives_create_a_review_warning(self):
        result = analyze_draft("Use eval(user_supplied_input) only after review.")
        check = next(item for item in result["checks"] if item["name"] == "execution_primitive_review")
        self.assertEqual(check["status"], "WARN")
        self.assertFalse(result["code_executed"])


if __name__ == "__main__":
    unittest.main()
