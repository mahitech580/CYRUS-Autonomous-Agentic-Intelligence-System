"""Boundary and non-execution regression matrix for draft static analysis."""
import unittest

from static_analysis import MAX_DRAFT_CHARS, analyze_draft


FENCE = chr(96) * 3


class StaticAnalysisBoundaryMatrixTests(unittest.TestCase):
    def check(self, result, name):
        return next(item for item in result["checks"] if item["name"] == name)

