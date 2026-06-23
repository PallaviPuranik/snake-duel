from __future__ import annotations

import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

venv_lib = BACKEND_ROOT / ".venv" / "lib"
for site_packages in venv_lib.glob("python*/site-packages"):
    site_packages_path = str(site_packages)
    if site_packages_path not in sys.path:
        sys.path.insert(0, site_packages_path)
