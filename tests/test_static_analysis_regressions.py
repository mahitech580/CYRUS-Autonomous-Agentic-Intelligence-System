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

    def test_10_uppercase_python_fence_is_parsed(self):
        fence = chr(96) * 3
        result = self.check(fence + "PYTHON\nvalue = 1\n" + fence)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")
        self.assertEqual(result["python_blocks_checked"], 1)

    def test_11_py_alias_is_recognized_as_python(self):
        fence = chr(96) * 3
        result = self.check(fence + "py\nprint('alias')\n" + fence)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")

    def test_12_multiple_python_blocks_are_counted(self):
        fence = chr(96) * 3
        result = self.check(fence + "python\na = 1\n" + fence + "\n" + fence + "py\nb = 2\n" + fence)
        self.assertEqual(result["python_blocks_checked"], 2)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")

    def test_13_one_invalid_block_fails_the_python_syntax_check(self):
        fence = chr(96) * 3
        source = fence + "python\nvalue = 1\n" + fence + "\n" + fence + "python\ndef broken(:\n" + fence
        result = self.check(source)
        self.assertEqual(self.named(result, "python_syntax")["status"], "FAIL")

    def test_14_python_that_would_raise_is_parsed_but_never_executed(self):
        fence = chr(96) * 3
        source = fence + "python\nraise RuntimeError('must not run')\n" + fence
        result = self.check(source)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")
        self.assertFalse(result["code_executed"])

    def test_15_openai_style_secret_pattern_is_flagged(self):
        source = "TOKEN = 'sk-" + ("a" * 28) + "'"
        result = self.check(source)
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "FAIL")

    def test_16_aws_access_key_pattern_is_flagged(self):
        result = self.check("AWS_ACCESS_KEY_ID = 'AKIAABCDEFGHIJKLMNOP'")
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "FAIL")

    def test_17_private_key_header_is_flagged(self):
        result = self.check("-----BEGIN PRIVATE KEY-----\nredacted\n")
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "FAIL")

    def test_18_rsa_private_key_header_is_flagged(self):
        result = self.check("-----BEGIN RSA PRIVATE KEY-----\nredacted\n")
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "FAIL")

    def test_19_ec_private_key_header_is_flagged(self):
        result = self.check("-----BEGIN EC PRIVATE KEY-----\nredacted\n")
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "FAIL")

    def test_20_openssh_private_key_header_is_flagged(self):
        result = self.check("-----BEGIN OPENSSH PRIVATE KEY-----\nredacted\n")
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "FAIL")

    def test_21_multiple_secret_kinds_are_named_in_the_report(self):
        source = "sk-" + ("b" * 24) + "\nAKIAABCDEFGHIJKLMNOP"
        detail = self.named(self.check(source), "likely_secret_scan")["detail"]
        self.assertIn("OpenAI-style secret", detail)
        self.assertIn("AWS access key", detail)

    def test_22_openai_secret_value_is_not_echoed_in_diagnostics(self):
        secret = "sk-" + ("c" * 30)
        result = self.check("API_KEY = '" + secret + "'")
        report = self.named(result, "likely_secret_scan")
        self.assertNotIn(secret, report["detail"])
        self.assertNotIn(secret, str(result))

    def test_23_aws_secret_value_is_not_echoed_in_diagnostics(self):
        secret = "AKIAABCDEFGHIJKLMNOP"
        result = self.check("AWS_ACCESS_KEY_ID = '" + secret + "'")
        self.assertNotIn(secret, str(result))

    def test_24_normal_draft_passes_likely_secret_scan(self):
        result = self.check("Use environment variables for runtime credentials.")
        self.assertEqual(self.named(result, "likely_secret_scan")["status"], "PASS")

    def test_25_eval_call_creates_a_review_warning(self):
        result = self.check("value = eval(user_input)")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")

    def test_26_exec_call_creates_a_review_warning(self):
        result = self.check("exec(source_text)")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")

    def test_27_os_system_call_creates_a_review_warning(self):
        result = self.check("os.system('echo hello')")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")

    def test_28_subprocess_run_call_creates_a_review_warning(self):
        result = self.check("subprocess.run(['git', 'status'])")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")

    def test_29_subprocess_popen_call_creates_a_review_warning(self):
        result = self.check("subprocess.Popen(['worker'])")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")

    def test_30_subprocess_call_creates_a_review_warning(self):
        result = self.check("subprocess.call(['worker'])")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")

    def test_31_safe_draft_passes_execution_primitive_review(self):
        result = self.check("def add(left, right):\n    return left + right")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "PASS")

    def test_32_comments_only_python_block_is_syntactically_valid(self):
        fence = chr(96) * 3
        result = self.check(fence + "python\n# reviewed draft\n" + fence)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")

    def test_33_empty_python_block_is_parsed_without_execution(self):
        fence = chr(96) * 3
        result = self.check(fence + "python\n\n" + fence)
        self.assertEqual(result["python_blocks_checked"], 1)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")

    def test_34_whitespace_after_python_language_marker_is_accepted(self):
        fence = chr(96) * 3
        result = self.check(fence + "python   \nnumber = 7\n" + fence)
        self.assertEqual(self.named(result, "python_syntax")["status"], "PASS")

    def test_35_javascript_fence_is_not_claimed_as_python_validation(self):
        fence = chr(96) * 3
        result = self.check(fence + "javascript\nconst x = 1;\n" + fence)
        self.assertEqual(result["python_blocks_checked"], 0)
        self.assertEqual(self.named(result, "python_syntax")["status"], "SKIP")

    def test_36_json_fence_is_not_counted_as_python(self):
        fence = chr(96) * 3
        result = self.check(fence + "json\n{\"ready\": true}\n" + fence)
        self.assertEqual(result["python_blocks_checked"], 0)
        self.assertEqual(self.named(result, "python_syntax")["status"], "SKIP")

    def test_37_python_block_count_is_zero_for_plain_text(self):
        result = self.check("Checklist: validate input, then persist safely.")
        self.assertEqual(result["python_blocks_checked"], 0)

    def test_38_analysis_check_names_are_unique(self):
        fence = chr(96) * 3
        result = self.check("Draft\n" + fence + "python\nanswer = 42\n" + fence)
        names = [item["name"] for item in result["checks"]]
        self.assertEqual(len(names), len(set(names)))

    def test_39_summary_counts_match_check_statuses(self):
        result = self.check("Draft without Python code")
        self.assertEqual(result["checks_passed"], sum(item["status"] == "PASS" for item in result["checks"]))
        self.assertEqual(result["checks_failed"], sum(item["status"] == "FAIL" for item in result["checks"]))

    def test_40_empty_draft_can_report_both_presence_failure_and_python_skip(self):
        result = self.check("")
        self.assertEqual(self.named(result, "draft_present")["status"], "FAIL")
        self.assertEqual(self.named(result, "python_syntax")["status"], "SKIP")
        self.assertEqual(result["status"], "FAILED")

    def test_41_every_check_detail_is_bounded(self):
        result = self.check("Draft " + ("x" * (MAX_DRAFT_CHARS + 100)))
        self.assertTrue(all(len(item["detail"]) <= 300 for item in result["checks"]))

    def test_42_python_syntax_error_reports_its_line_number(self):
        fence = chr(96) * 3
        result = self.check(fence + "python\ndef broken(:\n    pass\n" + fence)
        detail = self.named(result, "python_syntax")["detail"]
        self.assertIn("line 1", detail)

    def test_43_secret_scan_does_not_return_source_text(self):
        source = "credential = '" + ("z" * 50) + "'"
        result = self.check(source)
        self.assertNotIn(source, str(result))

    def test_44_oversized_source_is_still_reported_when_no_python_is_present(self):
        result = self.check("t" * (MAX_DRAFT_CHARS + 10))
        self.assertEqual(self.named(result, "draft_size_limit")["status"], "FAIL")
        self.assertEqual(result["python_blocks_checked"], 0)

    def test_45_process_execution_warning_does_not_execute_source(self):
        result = self.check("subprocess.run(['this-command-must-never-run'])")
        self.assertEqual(self.named(result, "execution_primitive_review")["status"], "WARN")
        self.assertFalse(result["code_executed"])

    def test_46_plain_text_draft_reports_warning_status_for_skipped_python_check(self):
        result = self.check("A plain text implementation outline.")
        self.assertEqual(result["status"], "COMPLETED_WITH_WARNINGS")

    def test_47_balanced_multiple_code_blocks_pass_markdown_structure(self):
        fence = chr(96) * 3
        source = fence + "text\nnotes\n" + fence + "\n" + fence + "python\nnumber = 1\n" + fence
        result = self.check(source)
        self.assertEqual(self.named(result, "markdown_code_fences")["status"], "PASS")

    def test_48_analysis_does_not_echo_the_original_implementation_field(self):
        source = "UNIQUE_DRAFT_CONTENT_012345"
        result = self.check(source)
        self.assertNotIn("implementation", result)
        self.assertNotIn(source, str(result))

    def test_49_limitation_explains_static_analysis_is_not_runtime_testing(self):
        result = self.check("def work():\n    return 1")
        self.assertTrue(any("not runtime testing" in item.lower() for item in result["limitations"]))

    def test_50_empty_draft_reports_consistent_failed_and_warning_counts(self):
        result = self.check("")
        self.assertEqual(result["checks_failed"], 1)
        self.assertEqual(result["checks_warning"], 2)
        self.assertEqual(result["status"], "FAILED")

if __name__ == "__main__":
    unittest.main()
