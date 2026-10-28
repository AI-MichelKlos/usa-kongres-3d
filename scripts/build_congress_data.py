#!/usr/bin/env python3
"""Download legislators-current and write public/data/congress.json."""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timezone

from congresslib import (
    OUT_PATH,
    SOURCE_URLS,
    build_payload,
    dump_payload,
    run_self_tests,
    summarize,
    validate_payload,
)


def download() -> tuple[list, str]:
    errors = []
    for url in SOURCE_URLS:
        req = urllib.request.Request(url, headers={"User-Agent": "kongreskortet-data-build"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = json.loads(res.read().decode("utf-8"))
            return raw, url
        except Exception as exc:  # noqa: BLE001 — try the next mirror
            errors.append(f"{url}: {exc}")
    raise SystemExit("Kunne ikke hente legislators-current:\n" + "\n".join(errors))


def main() -> None:
    run_self_tests()
    raw, retrieved_from = download()
    fetched = datetime.now(timezone.utc).replace(microsecond=0)
    payload = build_payload(
        raw,
        fetched.date(),
        retrieved_from,
        fetched.isoformat().replace("+00:00", "Z"),
    )
    validate_payload(payload)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(dump_payload(payload), encoding="utf-8")
    tmp.replace(OUT_PATH)
    print(summarize(payload))
    print(f"Skrev {OUT_PATH}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        sys.exit(f"Datafilen blev ikke skrevet: {exc}")
