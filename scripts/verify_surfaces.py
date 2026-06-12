#!/usr/bin/env python3
"""Verify prompt, registry, and static-doc surface invariants."""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys
import tomllib


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
BENCHMARK_ARTIFACT = pathlib.Path(
    "benchmarks/harsh-critic/results/realist-check-run/"
    "results_2026-03-05_04-04-23.json"
)
KNOWN_FOLLOWUP_CHECKS: list[str] = []


class SurfaceError(AssertionError):
    """Raised when a repository surface invariant fails."""


def read_text(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SurfaceError(message)


def extract_present_registry_paths(text: str) -> list[str]:
    paths: list[str] = []
    for line in text.splitlines():
        if not line.startswith("|") or "`" not in line:
            continue
        columns = [column.strip() for column in line.strip().strip("|").split("|")]
        if len(columns) < 5 or "present" not in columns[4]:
            continue
        paths.extend(re.findall(r"`([^`]+)`", columns[3]))
    return paths


def parse_codex_agent_toml(path: pathlib.Path) -> dict:
    return tomllib.loads(read_text(path))


def extract_xmlish_block(text: str, tag: str) -> str:
    pattern = rf"<{re.escape(tag)}(?:\s[^>]*)?>.*?</{re.escape(tag)}>"
    match = re.search(pattern, text, flags=re.DOTALL)
    if not match:
        raise SurfaceError(f"missing <{tag}> block")
    return match.group(0).strip()


def check_registry_paths(root: pathlib.Path) -> int:
    registry = root / "AGENTS.md"
    paths = extract_present_registry_paths(read_text(registry))
    require(paths, "AGENTS.md has no present registry paths")
    missing = [path for path in paths if not (root / path).exists()]
    require(not missing, "AGENTS.md lists missing present paths: " + ", ".join(missing))
    return len(paths)


def check_codex_toml(root: pathlib.Path) -> int:
    agent_paths = sorted((root / ".codex/agents").glob("*.toml"))
    require(agent_paths, ".codex/agents has no TOML files")
    for path in agent_paths:
        data = parse_codex_agent_toml(path)
        rel = path.relative_to(root)
        for key in ("name", "description", "developer_instructions"):
            require(data.get(key), f"{rel} is missing required key: {key}")
    return len(agent_paths)


def check_pages_workflow(root: pathlib.Path) -> None:
    workflow = root / ".github/workflows/pages.yml"
    text = read_text(workflow)
    required = [
        "paths: [docs/**]",
        "actions/upload-pages-artifact@v3",
        "path: docs",
    ]
    missing = [token for token in required if token not in text]
    require(not missing, f"{workflow.relative_to(root)} missing required tokens: {missing}")


def check_ignored_junk(root: pathlib.Path) -> None:
    junk_paths = [".DS_Store", ".claude/settings.local.json", ".fuse_hidden-example"]
    for junk_path in junk_paths:
        result = subprocess.run(
            ["git", "check-ignore", "--quiet", junk_path],
            cwd=root,
            check=False,
        )
        require(result.returncode == 0, f"{junk_path} is not ignored by .gitignore")


def check_data_critic_duplicates(root: pathlib.Path) -> None:
    root_skill = pathlib.Path("data-critic/.claude/skills/data-critic/SKILL.md")
    canonical_skill = pathlib.Path(
        "zivtech-data-skills/critic/.claude/skills/data-critic/SKILL.md"
    )
    root_agent = pathlib.Path("data-critic/.claude/agents/data-critic.md")
    canonical_agent = pathlib.Path(
        "zivtech-data-skills/critic/.claude/agents/data-critic.md"
    )

    root_skill_text = read_text(root / root_skill)
    canonical_skill_text = read_text(root / canonical_skill)
    root_protocol = extract_xmlish_block(root_skill_text, "Data_Review_Protocol")
    canonical_protocol = extract_xmlish_block(
        canonical_skill_text, "Data_Review_Protocol"
    )
    require(
        root_protocol == canonical_protocol,
        f"data-critic duplicate behavioral drift between {root_skill} and {canonical_skill}",
    )

    for token in (
        "<Companion_Skills>",
        "verification-before-completion",
        "systematic-debugging",
        "spec-kitty-bridge",
    ):
        require(token in root_skill_text, f"{root_skill} missing required token: {token}")

    root_agent_text = read_text(root / root_agent)
    canonical_agent_text = read_text(root / canonical_agent)
    root_examples = extract_xmlish_block(root_agent_text, "Severity_Calibration_Examples")
    canonical_examples = extract_xmlish_block(
        canonical_agent_text, "Severity_Calibration_Examples"
    )
    require(
        root_examples == canonical_examples,
        f"data-critic duplicate behavioral drift between {root_agent} and {canonical_agent}",
    )


def require_benchmark_caveat(text: str, path_label: str) -> None:
    lower_text = text.lower()
    missing = [token for token in ("historical", "raw artifact") if token not in lower_text]
    require(
        not missing,
        f"{path_label} contains benchmark numbers without caveat tokens: {missing}",
    )


def check_public_benchmark_caveats(root: pathlib.Path) -> list[str]:
    if (root / BENCHMARK_ARTIFACT).exists():
        return [
            f"WARNING: {BENCHMARK_ARTIFACT} exists; review docs against the restored source."
        ]
    for rel in ("docs/index.html", "docs/protocol.html"):
        require_benchmark_caveat(read_text(root / rel), rel)
    return []


def validate_fpr_chart(text: str, path_label: str) -> None:
    forbidden = ["d.label ===", "v2 target", "(targets)"]
    present = [token for token in forbidden if token in text]
    require(not present, f"{path_label} contains stale FPR chart tokens: {present}")
    required = [
        "badge: 'down-good'",
        "badge: 'up-bad'",
        "v1 (sonnet)",
        "v2 (opus)",
    ]
    missing = [token for token in required if token not in text]
    require(not missing, f"{path_label} missing FPR chart tokens: {missing}")


def check_fpr_chart(root: pathlib.Path) -> None:
    validate_fpr_chart(read_text(root / "docs/index.html"), "docs/index.html")


def run_checks(root: pathlib.Path) -> list[str]:
    check_registry_paths(root)
    check_codex_toml(root)
    check_pages_workflow(root)
    check_ignored_junk(root)
    check_data_critic_duplicates(root)
    warnings = check_public_benchmark_caveats(root)
    check_fpr_chart(root)
    return warnings


def main() -> int:
    if sys.version_info < (3, 11):
        print("ERROR: Python 3.11+ is required for tomllib.", file=sys.stderr)
        return 1

    try:
        warnings = run_checks(REPO_ROOT)
    except SurfaceError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    for label in KNOWN_FOLLOWUP_CHECKS:
        warnings.append(f"WARNING: {label} not yet enforced.")
    for warning in warnings:
        print(warning)

    print(
        "OK: registry paths, codex TOML, Pages workflow, ignore rules, "
        "data-critic duplicates, benchmark caveats, and FPR chart labels verified. "
        f"{len(KNOWN_FOLLOWUP_CHECKS)} follow-up checks not yet enforced."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
