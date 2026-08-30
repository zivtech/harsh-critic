from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import tempfile
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "scripts/verify_run_manifests.py"


def load_verifier():
    spec = importlib.util.spec_from_file_location("verify_run_manifests", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class VerifyRunManifestsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verifier = load_verifier()

    def manifest(self, root, *, status="stale", artifact=None, **overrides):
        target = root / "retained.txt"
        if artifact is None:
            target.write_text("actual", encoding="utf-8")
            artifact = {
                "role": "output",
                "path": "retained.txt",
                "sha256": self.verifier.sha256_path(target),
            }
        data = {
            "schema_version": 1,
            "record_type": "run_manifest",
            "id": "test-run",
            "skill": "test",
            "status": status,
            "status_reasons": ["test"],
            "missing_fields": ["provider.version"],
            "evidence_boundary": "test only",
            "retained_artifacts": [artifact],
        }
        data.update(overrides)
        return data

    def write_manifest(self, root, data, name="manifest.json"):
        manifest_dir = root / "manifests"
        manifest_dir.mkdir(exist_ok=True)
        (manifest_dir / name).write_text(json.dumps(data), encoding="utf-8")
        return manifest_dir

    def test_repository_gap_record_validates(self):
        self.assertEqual(self.verifier.validate_directory(REPO_ROOT), 1)

    def test_hash_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            (root / "retained.txt").write_text("actual", encoding="utf-8")
            manifest_dir = self.write_manifest(
                root,
                self.manifest(root, artifact={"role": "output", "path": "retained.txt", "sha256": "0" * 64}),
            )
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

    def test_gap_record_requires_absent_artifact(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            missing = root / "missing.json"
            missing.write_text("unexpected", encoding="utf-8")
            data = self.manifest(
                root,
                status="invalid",
                record_type="gap_record",
                skill=None,
                missing_fields=["raw_output"],
                known_absent_artifacts=[{"path": "missing.json", "reason": "test"}],
            )
            data.pop("skill")
            manifest_dir = self.write_manifest(root, data, "gap.json")
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

    def test_verified_status_and_mutable_or_short_refs_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            manifest_dir = self.write_manifest(root, self.manifest(root, status="verified"))
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

        for git_ref in ("666e6eb", "HEAD"):
            with tempfile.TemporaryDirectory() as temporary_directory:
                root = pathlib.Path(temporary_directory)
                target = root / "retained.txt"
                target.write_text("actual", encoding="utf-8")
                artifact = {
                    "role": "output",
                    "path": "retained.txt",
                    "sha256": self.verifier.sha256_path(target),
                    "historical_git_ref": git_ref,
                    "historical_sha256": "0" * 64,
                }
                manifest_dir = self.write_manifest(root, self.manifest(root, artifact=artifact))
                with self.assertRaises(self.verifier.ManifestError):
                    self.verifier.validate_directory(root, manifest_dir.relative_to(root))

    def test_symlink_and_duplicate_entries_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            outside = root.parent / "outside-retained.txt"
            outside.write_text("outside", encoding="utf-8")
            os.symlink(outside, root / "retained.txt")
            artifact = {"role": "output", "path": "retained.txt", "sha256": self.verifier.sha256_path(outside)}
            manifest_dir = self.write_manifest(root, self.manifest(root, artifact=artifact))
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            target = root / "one.txt"
            target.write_text("one", encoding="utf-8")
            artifact = {"path": "one.txt", "sha256": self.verifier.sha256_path(target)}
            artifacts = [
                {"role": "output", **artifact},
                {"role": "summary", **artifact},
            ]
            manifest_dir = self.write_manifest(root, self.manifest(root, retained_artifacts=artifacts))
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            outside_manifest = root.parent / "outside-manifest.json"
            outside_manifest.write_text(json.dumps(self.manifest(root)), encoding="utf-8")
            manifest_dir = root / "manifests"
            manifest_dir.mkdir()
            os.symlink(outside_manifest, manifest_dir / "manifest.json")
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, pathlib.Path("manifests"))

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            manifest_dir = self.write_manifest(root, self.manifest(root))
            self.write_manifest(root, self.manifest(root), "duplicate-id.json")
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = pathlib.Path(temporary_directory)
            first = root / "one.txt"
            second = root / "two.txt"
            first.write_text("one", encoding="utf-8")
            second.write_text("two", encoding="utf-8")
            artifacts = [
                {"role": "output", "path": "one.txt", "sha256": self.verifier.sha256_path(first)},
                {"role": "output", "path": "two.txt", "sha256": self.verifier.sha256_path(second)},
            ]
            manifest_dir = self.write_manifest(root, self.manifest(root, retained_artifacts=artifacts))
            with self.assertRaises(self.verifier.ManifestError):
                self.verifier.validate_directory(root, manifest_dir.relative_to(root))

    def test_absent_raw_artifact_is_not_reachable_in_history(self):
        raw_path = "benchmarks/harsh-critic/results/realist-check-run/results_2026-03-05_04-04-23.json"
        self.assertTrue(self.verifier.is_absent_from_reachable_history(REPO_ROOT, raw_path))
        self.assertFalse(self.verifier.is_absent_from_reachable_history(REPO_ROOT, "README.md"))

    def test_known_absent_paths_reject_parent_and_dangling_symlinks(self):
        for absent_path, setup in (
            ("linked.json", lambda root: os.symlink(root.parent, root / "linked.json")),
            ("missing.json", lambda root: os.symlink(root.parent / "does-not-exist", root / "missing.json")),
            ("missing-parent/missing.json", lambda root: os.symlink(root.parent, root / "missing-parent")),
        ):
            with self.subTest(absent_path=absent_path), tempfile.TemporaryDirectory() as temporary_directory:
                root = pathlib.Path(temporary_directory)
                data = self.manifest(
                    root,
                    status="invalid",
                    record_type="gap_record",
                    skill=None,
                    missing_fields=["raw_output"],
                    known_absent_artifacts=[{
                        "path": absent_path,
                        "reason": "test",
                        "absence_from_reachable_history": False,
                    }],
                )
                data.pop("skill")
                setup(root)
                manifest_dir = self.write_manifest(root, data)
                with self.assertRaises(self.verifier.ManifestError):
                    self.verifier.validate_directory(root, manifest_dir.relative_to(root))


if __name__ == "__main__":
    unittest.main()
