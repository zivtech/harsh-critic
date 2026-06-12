from __future__ import annotations

import importlib.util
import pathlib
import subprocess
import sys
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "scripts/verify_surfaces.py"


def load_verifier():
    spec = importlib.util.spec_from_file_location("verify_surfaces", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class VerifySurfacesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verifier = load_verifier()

    def test_script_subprocess_ok(self):
        result = subprocess.run(
            [sys.executable, "scripts/verify_surfaces.py"],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK:", result.stdout)

    def test_extract_present_registry_paths_from_table(self):
        sample = """
| Name | Type | Surface | Path | Status | Description |
|---|---|---|---|---|---|
| data-critic | critic | Claude skill | `data-critic/SKILL.md` | present duplicate | Mirror |
| drupal-critic | critic | external | `missing.md` | external | Not here |
"""
        self.assertEqual(
            self.verifier.extract_present_registry_paths(sample),
            ["data-critic/SKILL.md"],
        )

    def test_codex_toml_parse_helper(self):
        for path in sorted((REPO_ROOT / ".codex/agents").glob("*.toml")):
            data = self.verifier.parse_codex_agent_toml(path)
            self.assertIn("description", data)
            self.assertIn("developer_instructions", data)

    def test_extract_xmlish_block(self):
        sample = "before <Thing>value</Thing> after"
        self.assertEqual(
            self.verifier.extract_xmlish_block(sample, "Thing"),
            "<Thing>value</Thing>",
        )
        with self.assertRaises(self.verifier.SurfaceError):
            self.verifier.extract_xmlish_block(sample, "Missing")

    def test_benchmark_caveat_helper(self):
        good = "Historical benchmark notes: raw artifact not present."
        self.verifier.require_benchmark_caveat(good, "inline")
        with self.assertRaises(self.verifier.SurfaceError):
            self.verifier.require_benchmark_caveat("Current benchmark results.", "inline")

    def test_fpr_chart_helper(self):
        good = """
const data = [
  { label: 'v1 (sonnet)', badge: 'down-good' },
  { label: 'v2 (opus)', badge: 'up-bad' },
];
"""
        self.verifier.validate_fpr_chart(good, "inline")
        with self.assertRaises(self.verifier.SurfaceError):
            self.verifier.validate_fpr_chart("if (d.label === 'v2 target') {}", "inline")


if __name__ == "__main__":
    unittest.main()
