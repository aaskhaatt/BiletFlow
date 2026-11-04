"""Runs every end-to-end test and exits with 1 if anything failed.

From backend/, with the venv active and Postgres running:
    python tests/run_all.py            # everything
    python tests/run_all.py orders     # only files whose name contains "orders"
"""
import subprocess
import sys
from pathlib import Path

E2E_DIR = Path(__file__).resolve().parent / "e2e"


def main() -> int:
    name_filter = sys.argv[1] if len(sys.argv) > 1 else ""
    files = sorted(f for f in E2E_DIR.glob("test_*.py") if name_filter in f.name)

    failed = []
    for file in files:
        # each test runs in its own process with its own server, so one crash can't break the others
        if subprocess.run([sys.executable, str(file)], cwd=E2E_DIR).returncode != 0:
            failed.append(file.name)

    print("=" * 60)
    if failed:
        print(f"FAILED: {len(failed)} of {len(files)} test files: {', '.join(failed)}")
        return 1
    print(f"ALL PASSED: {len(files)} test files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
