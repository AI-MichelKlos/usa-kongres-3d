#!/usr/bin/env python3
"""Check public/data/congress.json without downloading anything."""

from __future__ import annotations

import json
import sys

from congresslib import OUT_PATH, summarize, validate_payload


def main() -> None:
    if not OUT_PATH.exists():
        sys.exit(f"Mangler {OUT_PATH}. Kør scripts/build_congress_data.py")
    payload = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    validate_payload(payload)
    print(summarize(payload))
    print("ok")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        sys.exit(f"Ugyldig datafil: {exc}")
