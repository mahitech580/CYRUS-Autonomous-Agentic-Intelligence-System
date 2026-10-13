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

if __name__ == "__main__":
    unittest.main()
