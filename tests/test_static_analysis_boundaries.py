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

    def test_no_python_fence_marks_syntax_check_skipped(self):
        result = analyze_draft("Plain text implementation notes")
        self.assertEqual(self.check(result, "python_syntax")["status"], "SKIP")

    def test_python_fence_alias_py_is_parsed(self):
        result = analyze_draft(FENCE + "py\nx = 1\n" + FENCE)
        self.assertEqual(self.check(result, "python_syntax")["status"], "PASS")

    def test_python_fence_language_is_case_insensitive(self):
        result = analyze_draft(FENCE + "PYTHON\nx = 1\n" + FENCE)
        self.assertEqual(self.check(result, "python_syntax")["status"], "PASS")

    def test_multiple_valid_python_fences_are_counted(self):
        source = FENCE + "python\nx = 1\n" + FENCE + "\n" + FENCE + "py\ny = 2\n" + FENCE
        result = analyze_draft(source)
        self.assertEqual(result["python_blocks_checked"], 2)
        self.assertEqual(self.check(result, "python_syntax")["status"], "PASS")

    def test_syntax_error_in_second_python_fence_is_reported(self):
        source = FENCE + "python\nx = 1\n" + FENCE + "\n" + FENCE + "python\ndef broken(:\n" + FENCE
        result = analyze_draft(source)
        self.assertEqual(self.check(result, "python_syntax")["status"], "FAIL")

    def test_unmatched_fence_marks_fence_check_failed(self):
        result = analyze_draft("notes " + FENCE + "python")
        self.assertEqual(self.check(result, "markdown_code_fences")["status"], "FAIL")

    def test_balanced_fences_without_python_are_not_syntax_tested(self):
        result = analyze_draft(FENCE + "javascript\nconst x = 1;\n" + FENCE)
        self.assertEqual(self.check(result, "markdown_code_fences")["status"], "PASS")
        self.assertEqual(self.check(result, "python_syntax")["status"], "SKIP")

    def test_safe_python_block_reports_one_checked_block(self):
        result = analyze_draft(FENCE + "python\ndef add(a, b):\n    return a + b\n" + FENCE)
        self.assertEqual(result["python_blocks_checked"], 1)
        self.assertFalse(result["code_executed"])

    def test_os_system_call_is_flagged_for_review(self):
        result = analyze_draft("os.system('echo hello')")
        self.assertEqual(self.check(result, "execution_primitive_review")["status"], "WARN")

    def test_subprocess_run_call_is_flagged_for_review(self):
        result = analyze_draft("subprocess.run(['echo', 'hello'])")
        self.assertEqual(self.check(result, "execution_primitive_review")["status"], "WARN")

    def test_subprocess_popen_call_is_flagged_for_review(self):
        result = analyze_draft("subprocess.Popen(['echo', 'hello'])")
        self.assertEqual(self.check(result, "execution_primitive_review")["status"], "WARN")

    def test_subprocess_call_call_is_flagged_for_review(self):
        result = analyze_draft("subprocess.call(['echo', 'hello'])")
        self.assertEqual(self.check(result, "execution_primitive_review")["status"], "WARN")

    def test_near_match_module_name_is_not_flagged_as_subprocess(self):
        result = analyze_draft("subprocesses.run(['echo'])")
        self.assertEqual(self.check(result, "execution_primitive_review")["status"], "PASS")
