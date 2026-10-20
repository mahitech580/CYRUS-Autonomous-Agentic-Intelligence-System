"""Boundary and non-execution regression matrix for draft static analysis."""
import unittest

from static_analysis import MAX_DRAFT_CHARS, analyze_draft


FENCE = chr(96) * 3


class StaticAnalysisBoundaryMatrixTests(unittest.TestCase):
    def check(self, result, name):
        return next(item for item in result["checks"] if item["name"] == name)


    def test_empty_source_is_reported_as_missing(self):
        result = analyze_draft("")
                    self.assertEqual(self.check(result, "draft_present")["status"], "FAIL")

    def test_whitespace_source_is_reported_as_missing(self):
        result = analyze_draft(" \n\t ")
                    self.assertEqual(self.check(result, "draft_present")["status"], "FAIL")

    def test_none_input_is_safely_normalized(self):
        result = analyze_draft(None)
                    self.assertEqual(self.check(result, "draft_present")["status"], "FAIL")
                    self.assertFalse(result["code_executed"])

    def test_integer_input_is_safely_normalized(self):
        result = analyze_draft(42)
                    self.assertEqual(self.check(result, "draft_present")["status"], "FAIL")

    def test_text_at_size_limit_passes_size_check(self):
        result = analyze_draft("x" * MAX_DRAFT_CHARS)
                    self.assertEqual(self.check(result, "draft_size_limit")["status"], "PASS")

    def test_text_one_character_over_limit_fails_size_check(self):
        result = analyze_draft("x" * (MAX_DRAFT_CHARS + 1))
                    self.assertEqual(self.check(result, "draft_size_limit")["status"], "FAIL")

    def test_size_check_detail_includes_configured_limit(self):
        result = analyze_draft("x" * (MAX_DRAFT_CHARS + 1))
                    self.assertIn(str(MAX_DRAFT_CHARS), self.check(result, "draft_size_limit")["detail"])
