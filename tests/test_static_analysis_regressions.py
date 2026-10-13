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


if __name__ == "__main__":
    unittest.main()
