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

if __name__ == "__main__":
    unittest.main()
