"""Regression coverage for edge cases in CYRUS draft static analysis."""
import unittest

from static_analysis import MAX_DRAFT_CHARS, analyze_draft


class StaticAnalysisHardeningRegressionTests(unittest.TestCase):
    def check(self, source):
        return analyze_draft(source)

    def named(self, result, name):
        return next(item for item in result["checks"] if item["name"] == name)

    def test_01_empty_draft_fails_presence_check(self):
        result = self.check("")
        self.assertEqual(self.named(result, "draft_present")["status"], "FAIL")
        self.assertEqual(result["status"], "FAILED")


    def test_02_none_input_is_handled_as_an_empty_draft(self):
        result = self.check(None)
        self.assertEqual(self.named(result, "draft_present")["status"], "FAIL")
        self.assertFalse(result["code_executed"])

    def test_03_numeric_input_is_not_treated_as_source_code(self):
        result = self.check(12345)
        self.assertEqual(self.named(result, "draft_present")["status"], "FAIL")
        self.assertEqual(result["python_blocks_checked"], 0)

    def test_04_whitespace_only_draft_fails_presence_check(self):
        result = self.check(" \n\t  ")
        self.assertEqual(self.named(result, "draft_present")["status"], "FAIL")

    def test_05_draft_at_exact_size_limit_is_allowed(self):
        result = self.check("x" * MAX_DRAFT_CHARS)
        self.assertEqual(self.named(result, "draft_size_limit")["status"], "PASS")

    def test_06_draft_over_size_limit_is_rejected(self):
        result = self.check("x" * (MAX_DRAFT_CHARS + 1))
        self.assertEqual(self.named(result, "draft_size_limit")["status"], "FAIL")
        self.assertEqual(result["status"], "FAILED")

    def test_07_two_markdown_fences_are_balanced(self):
        fence = chr(96) * 3
        result = self.check(fence + "text" + fence)
        self.assertEqual(self.named(result, "markdown_code_fences")["status"], "PASS")

    def test_08_odd_number_of_markdown_fences_is_rejected(self):
        fence = chr(96) * 3
        result = self.check("open " + fence + "python\nprint('x')")
        self.assertEqual(self.named(result, "markdown_code_fences")["status"], "FAIL")

    def test_09_missing_python_block_is_explicitly_skipped(self):
        result = self.check("Plain text draft with no code")
        self.assertEqual(self.named(result, "python_syntax")["status"], "SKIP")
        self.assertEqual(result["python_blocks_checked"], 0)

if __name__ == "__main__":
    unittest.main()
