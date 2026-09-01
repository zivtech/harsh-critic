from __future__ import annotations

import importlib.util
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
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


class CriticPromptContractTest(unittest.TestCase):
    """Negative tests: each invariant must actually fail when violated.

    Every case copies the real repo into a temp tree, breaks exactly one thing,
    and asserts the corresponding check raises. A green verifier over an
    unbroken tree proves nothing on its own.
    """

    @classmethod
    def setUpClass(cls):
        cls.verifier = load_verifier()

    def _sandbox(self):
        """Copy the surfaces the contract checks read into a temp repo root."""
        tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        for surfaces in self.verifier.CRITIC_SURFACES.values():
            for rel in surfaces:
                dst = tmp / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(REPO_ROOT / rel, dst)
        return tmp

    @staticmethod
    def _patch(root: pathlib.Path, rel: str, old: str, new: str):
        path = root / rel
        text = path.read_text(encoding="utf-8")
        assert old in text, f"patch anchor missing in {rel}: {old!r}"
        path.write_text(text.replace(old, new, 1), encoding="utf-8")

    def test_unbroken_sandbox_passes(self):
        root = self._sandbox()
        self.verifier.check_critic_prompt_contracts(root)

    def test_missing_verdict_label_fails(self):
        root = self._sandbox()
        rel = ".claude/agents/harsh-critic.md"
        path = root / rel
        path.write_text(
            path.read_text(encoding="utf-8").replace("ACCEPT-WITH-RESERVATIONS", "ACCEPT-ISH"),
            encoding="utf-8",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("missing verdict labels", str(ctx.exception))

    def test_missing_whats_missing_section_fails(self):
        root = self._sandbox()
        rel = ".claude/skills/harsh-critic/SKILL.md"
        path = root / rel
        path.write_text(
            path.read_text(encoding="utf-8").replace("What's Missing", "Notes"),
            encoding="utf-8",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("load-bearing sections", str(ctx.exception))

    def test_missing_response_contract_fails(self):
        root = self._sandbox()
        rel = ".claude/agents/proposal-critic.md"
        self._patch(root, rel, "<Final_Response_Contract>", "<Closing_Notes>")
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("Final_Response_Contract", str(ctx.exception))

    def test_missing_discovery_separation_fails(self):
        root = self._sandbox()
        rel = ".claude/agents/harsh-critic.md"
        self._patch(root, rel, "<Discovery_Filtering_Separation>", "<Notes_On_Filtering>")
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("Discovery_Filtering_Separation", str(ctx.exception))

    def test_dropped_technique_fails(self):
        root = self._sandbox()
        rel = ".claude/agents/proposal-critic.md"
        path = root / rel
        text = path.read_text(encoding="utf-8")
        path.write_text(
            text.replace("Backcasting", "Forward pass").replace("backcast", "trace"),
            encoding="utf-8",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("Backcasting", str(ctx.exception))

    def test_dangling_cross_reference_fails(self):
        """The exact defect class this check exists for: naming a gate the
        surface does not define."""
        root = self._sandbox()
        rel = ".claude/agents/proposal-critic.md"
        self._patch(
            root,
            rel,
            "the self-audit and Realist Check still route",
            "the self-audit, Realist Check, and Security Exploitability Gate still route",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("never defines it", str(ctx.exception))

    def test_separated_calibration_guidance_fails(self):
        root = self._sandbox()
        rel = ".claude/agents/harsh-critic.md"
        path = root / rel
        text = path.read_text(encoding="utf-8")
        # Strip every rubber-stamp mention (the check case-folds, so must this),
        # then reintroduce exactly one far from any outrage mention.
        text = re.sub("rubber-stamp", "approve-without-reading", text, flags=re.IGNORECASE)
        self.assertNotIn("rubber-stamp", text.lower(), "precondition: all mentions stripped")
        text = text.replace(
            "<Agent_Prompt>", "<Agent_Prompt>\n  <Note>Do not rubber-stamp.</Note>", 1
        )
        self.assertEqual(
            text.lower().count("rubber-stamp"), 1, "precondition: exactly one mention remains"
        )
        path.write_text(text, encoding="utf-8")
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("separates anti-rubber-stamp", str(ctx.exception))

    def test_calibration_adjacency_boundaries(self):
        """Adjacent guidance passes; guidance pushed past the limit fails."""
        limit = self.verifier.CALIBRATION_ADJACENCY_LIMIT
        near = "Do not rubber-stamp." + ("x" * 10) + "Do not manufacture outrage."
        self.verifier.check_calibration_adjacency(near, "synthetic")

        far = "Do not rubber-stamp." + ("x" * (limit + 50)) + "Do not manufacture outrage."
        with self.assertRaises(self.verifier.SurfaceError):
            self.verifier.check_calibration_adjacency(far, "synthetic")

        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_calibration_adjacency("Do not manufacture outrage.", "synthetic")
        self.assertIn("anti-rubber-stamp", str(ctx.exception))

    def test_precommitment_after_verification_fails(self):
        root = self._sandbox()
        rel = ".claude/agents/harsh-critic.md"
        path = root / rel
        text = path.read_text(encoding="utf-8")
        phase1 = "Phase 1 — Pre-commitment"
        phase2 = "Phase 2 — Verification"
        text = text.replace(phase1, "@@P1@@").replace(phase2, phase1).replace("@@P1@@", phase2)
        path.write_text(text, encoding="utf-8")
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("pre-commitment must come first", str(ctx.exception))

    def test_codex_wrapper_is_read_through_toml(self):
        """Codex surfaces must be parsed, not string-matched: a prompt body
        that only exists outside developer_instructions must not count."""
        root = self._sandbox()
        rel = ".codex/agents/harsh-critic.toml"
        path = root / rel
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        body = data["developer_instructions"].replace("What's Missing", "Notes")
        path.write_text(
            'name = "harsh-critic"\n'
            'description = "d"\n'
            "# What's Missing appears only in this comment\n"
            'developer_instructions = """\n' + body + '"""\n',
            encoding="utf-8",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("load-bearing sections", str(ctx.exception))

    def test_missing_surface_fails(self):
        root = self._sandbox()
        rel = ".agents/skills/proposal-critic/SKILL.md"
        (root / rel).unlink()
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_critic_surface(root, rel)
        self.assertIn("critic surface is missing", str(ctx.exception))


class MirrorParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verifier = load_verifier()

    def _sandbox(self):
        tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        for source_rel, mirror_rel, _ in self.verifier.MIRROR_PAIRS:
            for rel in (source_rel, mirror_rel):
                dst = tmp / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(REPO_ROOT / rel, dst)
        return tmp

    def test_unbroken_mirrors_pass(self):
        self.verifier.check_mirror_parity(self._sandbox())

    def test_drifted_mirror_fails(self):
        root = self._sandbox()
        mirror = root / ".agents/skills/harsh-critic/SKILL.md"
        mirror.write_text(
            mirror.read_text(encoding="utf-8") + "\nlocal-only addition\n",
            encoding="utf-8",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_mirror_parity(root)
        self.assertIn("has drifted from", str(ctx.exception))

    def test_lost_substitution_anchor_fails(self):
        root = self._sandbox()
        source = root / ".claude/skills/proposal-critic/SKILL.md"
        source.write_text(
            source.read_text(encoding="utf-8").replace(
                "Works standalone with Claude Code. If oh-my-claudecode is installed",
                "Runs anywhere. If oh-my-claudecode is installed",
            ),
            encoding="utf-8",
        )
        with self.assertRaises(self.verifier.SurfaceError) as ctx:
            self.verifier.check_mirror_parity(root)
        self.assertIn("mirror substitution anchor", str(ctx.exception))
