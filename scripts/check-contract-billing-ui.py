"""Ownership classification now uses ordinary operations, covered by this shared UI suite."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name('check-operations-ui.py')), run_name='__main__')
