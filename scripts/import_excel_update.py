"""Import the latest personal restaurant workbook into Supabase.

Run without --apply to inspect proposed mappings. With --apply, the script
updates matched restaurants and creates unmatched workbook rows. Manual pins
are never overwritten; an address change instead enters the review queue.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd


DEFAULT_WORKBOOK = Path(r"D:\CODE\Database\ProtFood_app\20260829_danh_sach_quan_an.xlsx")
DEFAULT_GEOCODER = "https://prot-food.vercel.app/api/geocode"

# These are intentional renames, not new restaurants.
ALIASES = {
    ("phoga", "156quanthanh"): ("phoga", "quanthanh"),
    ("phosang", "85quanthanh"): ("phogaubo", "85quanthanh"),
    ("bunmammientaychu8", "24nguyenthuonghien"): ("bunmam", "nguyenthuonghien"),
}


def normalize(value: Any) -> str:
    plain = unicodedata.normalize("NFD", str(value or ""))
    plain = "".join(char for char in plain if unicodedata.category(char) != "Mn")
    plain = plain.replace("đ", "d").replace("Đ", "D").lower()
    return re.sub(r"[^a-z0-9]", "", plain)


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key] = value.strip().strip('"')
    return values


def rest(url: str, key: str, method: str, route: str, payload: Any | None = None) -> Any:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(f"{url}/rest/v1/{route}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=25) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase {method} {route}: {error.code} {detail}") from error


def geocode(name: str, address: str) -> dict[str, Any] | None:
    query = urlencode({"name": name, "address": address})
    request = Request(
        f"{DEFAULT_GEOCODER}?{query}",
        headers={"User-Agent": "Prot Food Excel import/2.0 (personal list)"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8")).get("result")
    except Exception:
        return None


def excel_rows(workbook: Path) -> list[dict[str, Any]]:
    sheet = pd.read_excel(workbook).fillna("")
    rows = []
    for _, source in sheet.iterrows():
        name = str(source["Tên quán"]).strip()
        address = str(source["Địa chỉ"]).strip()
        note = str(source["Ghi chú"]).strip()
        plus_code = str(source["Plus Code"]).strip()
        if plus_code:
            note = f"{note}\n" if note else ""
            note += f"Plus Code: {plus_code}"
        rows.append(
            {
                "row": int(source["Số thứ tự"]),
                "name": name,
                "address_raw": address or None,
                "notes": note or None,
                "category": str(source["Nhóm món"]).strip() or None,
                "status": "da_den" if str(source["Phân loại"]).strip() == "Đã đến" else "muon_den",
            }
        )
    return rows


def match_rows(source: list[dict[str, Any]], existing: list[dict[str, Any]]) -> tuple[list[tuple[dict[str, Any], dict[str, Any] | None]], list[dict[str, Any]]]:
    available = existing.copy()
    matched: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    for row in source:
        name_key, address_key = normalize(row["name"]), normalize(row["address_raw"])
        expected_name, expected_address = ALIASES.get((name_key, address_key), (name_key, address_key))
        address_matches = [
            item
            for item in available
            if normalize(item["name"]) == expected_name
            and normalize(item.get("address_raw")) == expected_address
        ]
        name_matches = [
            item for item in available if normalize(item["name"]) == expected_name
        ]
        found = address_matches[0] if address_matches else (name_matches[0] if len(name_matches) == 1 else None)
        if found:
            available.remove(found)
        matched.append((row, found))
    return matched, available


def payload_for(row: dict[str, Any], existing: dict[str, Any] | None) -> dict[str, Any]:
    payload = {
        "name": row["name"],
        "address_raw": row["address_raw"],
        "notes": row["notes"],
        "category": row["category"],
        "status": row["status"],
    }
    if existing and normalize(existing.get("address_raw")) != normalize(row["address_raw"]):
        payload["location_verification"] = "needs_review"
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--geocode-missing", action="store_true")
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    args = parser.parse_args()
    env = read_env(Path(".env.local"))
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY.")

    if args.geocode_missing:
        missing = rest(
            url,
            key,
            "GET",
            "restaurants?select=id,name,address_raw&lat=is.null&address_raw=not.is.null",
        )
        print(f"Geocode {len(missing)} quán chưa có toạ độ.")
        for index, restaurant in enumerate(missing):
            result = geocode(restaurant["name"], restaurant["address_raw"])
            if result:
                rest(
                    url,
                    key,
                    "PATCH",
                    f"restaurants?id=eq.{restaurant['id']}",
                    {
                        "lat": result["lat"],
                        "lng": result["lng"],
                        "geocode_source": "nominatim",
                        "geocode_confidence": "low",
                        "location_verification": "needs_review",
                    },
                )
            if index < len(missing) - 1:
                time.sleep(1.1)
        return 0

    source = excel_rows(args.workbook)
    existing = rest(url, key, "GET", "restaurants?select=*")
    matched, orphaned = match_rows(source, existing)
    updates = [(row, item) for row, item in matched if item]
    inserts = [row for row, item in matched if not item]

    print(json.dumps({
        "workbook_rows": len(source),
        "updates": len(updates),
        "inserts": len(inserts),
        "not_in_workbook": [{"name": item["name"], "address": item.get("address_raw")} for item in orphaned],
        "new_rows": [{"row": row["row"], "name": row["name"], "address": row["address_raw"]} for row in inserts],
    }, ensure_ascii=False, indent=2))
    if not args.apply:
        return 0

    for row, item in updates:
        rest(url, key, "PATCH", f"restaurants?id=eq.{item['id']}", payload_for(row, item))

    for index, row in enumerate(inserts):
        payload = payload_for(row, None)
        result = geocode(row["name"], row["address_raw"] or "") if row["address_raw"] else None
        if result:
            payload.update(
                {
                    "lat": result["lat"],
                    "lng": result["lng"],
                    "geocode_source": "nominatim",
                    "geocode_confidence": "low",
                    "location_verification": "needs_review",
                }
            )
        rest(url, key, "POST", "restaurants", payload)
        if index < len(inserts) - 1:
            time.sleep(1.1)

    print(f"Đã áp dụng {len(updates)} cập nhật và thêm {len(inserts)} quán mới.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
