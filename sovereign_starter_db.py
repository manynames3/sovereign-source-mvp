#!/usr/bin/env python3
"""Build a starter Sovereign Source supplier database from open government data."""

from __future__ import annotations

import logging
import re
import sqlite3
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Iterable

import click
import pandas as pd
import requests
from requests import RequestException
from tqdm import tqdm

USASPENDING_ENDPOINT = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
DOD_AGENCIES = ["097", "1700", "2100", "5700", "9700"]
DOD_AGENCY_NAMES = ["Department of Defense"]
ERROR_LOG_PATH = Path("pipeline_errors.log")

NAICS_CODES = {
    "332811": "Metal Heat Treating",
    "332812": "Metal Coating / Engraving",
    "332813": "Electroplating / Anodizing",
    "336411": "Aircraft Manufacturing",
    "336412": "Aircraft Engine & Parts",
    "336413": "Other Aircraft Parts",
    "336992": "Military Armored Vehicle Parts",
    "541380": "Testing Laboratories",
    "334511": "Search / Navigation Equipment",
    "332999": "Misc Fabricated Metal Products",
}

OUTPUT_COLUMNS = [
    "company_name",
    "uei",
    "cage_code",
    "naics_code",
    "naics_label",
    "state",
    "city",
    "zip",
    "contact_name",
    "contact_phone",
    "contact_email",
    "dod_award_amount",
    "awarding_agency",
    "award_id",
    "nadcap_status",
    "cmmc_status",
    "sovereign_tier",
    "pulled_at",
]

SAM_COLUMN_ALIASES = {
    "cage_code": ["CAGE CODE", "CAGE"],
    "uei": ["UEI SAM", "UEI", "UNIQUE ENTITY ID"],
    "legal_business_name": ["LEGAL BUSINESS NAME", "ENTITY LEGAL BUSINESS NAME"],
    "state": ["PHYSICAL ADDRESS STATE", "STATE"],
    "city": ["PHYSICAL ADDRESS CITY", "CITY"],
    "zip": ["PHYSICAL ADDRESS ZIP CODE", "ZIP", "ZIP CODE"],
    "first_name": ["GOVT BUS POC FIRST NAME"],
    "last_name": ["GOVT BUS POC LAST NAME"],
    "phone": ["GOVT BUS POC US PHONE", "GOVT BUS POC PHONE"],
    "email": ["GOVT BUS POC EMAIL"],
    "naics": ["NAICS CODE STRING", "NAICS"],
    "registration_status": ["REGISTRATION STATUS"],
}


def configure_logging() -> None:
    logging.basicConfig(
        filename=ERROR_LOG_PATH,
        level=logging.WARNING,
        format="%(asctime)s %(levelname)s %(message)s",
    )


def parse_csv_list(value: str | None, allowed: Iterable[str] | None = None) -> list[str]:
    if not value:
        return []
    parsed = [item.strip().upper() for item in value.split(",") if item.strip()]
    if allowed is not None:
        allowed_set = set(allowed)
        unknown = [item for item in parsed if item not in allowed_set]
        if unknown:
            raise click.BadParameter(f"Unsupported value(s): {', '.join(unknown)}")
    return parsed


def normalize_naics_filter(value: str | None) -> list[str]:
    parsed = parse_csv_list(value, NAICS_CODES.keys())
    return parsed or list(NAICS_CODES.keys())


def assign_sovereign_tier(award_amount: float | int | str) -> str:
    amount = parse_amount(award_amount)
    if amount >= 10_000_000:
        return "Tier 1 (Prime)"
    if amount >= 1_000_000:
        return "Tier 2 (Mid)"
    if amount >= 100_000:
        return "Tier 3 (Small)"
    return "Tier 4 (Emerging)"


def tier_rank(tier: str) -> int:
    match = re.search(r"Tier\s+([1-4])", tier)
    if not match:
        return 4
    return int(match.group(1))


def parse_amount(value: float | int | str | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, int | float):
        return float(value)
    normalized = str(value).replace("$", "").replace(",", "").strip()
    if not normalized:
        return 0.0
    try:
        return float(normalized)
    except ValueError:
        return 0.0


def safe_str(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def pick(record: dict[str, object], *keys: str) -> object:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return ""


def stringify_agency(value: object) -> str:
    if isinstance(value, dict):
        for key in ("name", "toptier_name", "subtier_name"):
            if value.get(key):
                return safe_str(value[key])
    return safe_str(value)


def spending_payload(naics_code: str, start_date: date, end_date: date, page: int) -> dict[str, object]:
    return {
        "filters": {
            "award_type_codes": ["A", "B", "C", "D"],
            "naics_codes": [naics_code],
            # USASpending's live advanced-search API accepts agency names in this filter.
            # DOD_AGENCIES keeps the prompt's reference codes available for downstream use.
            "agencies": [
                {"type": "awarding", "tier": "toptier", "name": agency}
                for agency in DOD_AGENCY_NAMES
            ],
            "time_period": [{"start_date": start_date.isoformat(), "end_date": end_date.isoformat()}],
        },
        "fields": [
            "Award ID",
            "Recipient Name",
            "Recipient UEI",
            "recipient_uei",
            "Awarding Agency",
            "Award Amount",
            "Place of Performance City Code",
            "Place of Performance State Code",
            "naics_code",
        ],
        "limit": 100,
        "page": page,
        "sort": "Award Amount",
        "order": "desc",
        "subawards": False,
    }


def parse_usaspending_record(record: dict[str, object], pulled_at: str) -> dict[str, object]:
    amount = parse_amount(pick(record, "Award Amount", "award_amount", "Award Amount ($)"))
    naics_code = safe_str(pick(record, "naics_code", "NAICS Code", "NAICS"))
    return {
        "company_name": safe_str(pick(record, "Recipient Name", "recipient_name")),
        "uei": safe_str(pick(record, "Recipient UEI", "recipient_uei", "UEI")).upper(),
        "cage_code": "",
        "naics_code": naics_code,
        "naics_label": NAICS_CODES.get(naics_code, ""),
        "state": safe_str(
            pick(record, "Place of Performance State Code", "Place of Performance State", "pop_state")
        ).upper(),
        "city": safe_str(
            pick(record, "Place of Performance City Code", "Place of Performance City", "Place of Performance City Name")
        ),
        "zip": "",
        "contact_name": "",
        "contact_phone": "",
        "contact_email": "",
        "dod_award_amount": amount,
        "awarding_agency": stringify_agency(pick(record, "Awarding Agency", "awarding_agency")),
        "award_id": safe_str(pick(record, "Award ID", "award_id", "generated_unique_award_id")),
        "nadcap_status": "VERIFY eAuditNet",
        "cmmc_status": "VERIFY SPRS",
        "sovereign_tier": assign_sovereign_tier(amount),
        "pulled_at": pulled_at,
    }


def fetch_usaspending_awards(
    naics_codes: list[str],
    years: int,
    state_filter: list[str] | None = None,
    delay_seconds: float = 0.3,
    session: requests.Session | None = None,
) -> pd.DataFrame:
    end_date = datetime.now(UTC).date()
    start_date = end_date - timedelta(days=365 * years)
    pulled_at = end_date.isoformat()
    client = session or requests.Session()
    rows: list[dict[str, object]] = []

    for naics_code in tqdm(naics_codes, desc="USASpending NAICS"):
        page = 1
        while True:
            payload = spending_payload(naics_code, start_date, end_date, page)
            try:
                response = client.post(USASPENDING_ENDPOINT, json=payload, timeout=30)
                response.raise_for_status()
                body = response.json()
            except (RequestException, ValueError) as exc:
                logging.warning("USASpending failed for NAICS %s page %s: %s", naics_code, page, exc)
                break

            for record in body.get("results", []):
                if isinstance(record, dict):
                    rows.append(parse_usaspending_record(record, pulled_at))

            page_metadata = body.get("page_metadata", {})
            if not page_metadata.get("hasNext"):
                break
            page += 1
            time.sleep(delay_seconds)

    awards = enforce_output_schema(pd.DataFrame(rows))
    if state_filter:
        awards = awards[awards["state"].isin(state_filter)].copy()
    return deduplicate_usaspending_awards(awards)


def deduplicate_usaspending_awards(awards: pd.DataFrame) -> pd.DataFrame:
    awards = enforce_output_schema(awards)
    if awards.empty:
        return awards
    working = awards.copy()
    working["dod_award_amount"] = working["dod_award_amount"].map(parse_amount)
    working["_dedup_key"] = [
        uei if uei else f"missing-uei-{index}" for index, uei in enumerate(working["uei"].map(safe_str))
    ]
    working = working.sort_values("dod_award_amount", ascending=False)
    working = working.drop_duplicates("_dedup_key", keep="first")
    return enforce_output_schema(working.drop(columns=["_dedup_key"]))


def load_sam_extract(
    sam_extract: Path,
    naics_codes: list[str],
    state_filter: list[str] | None = None,
    chunksize: int = 100_000,
) -> pd.DataFrame:
    sam_extract = Path(sam_extract)
    if not sam_extract.exists():
        raise FileNotFoundError(f"SAM extract not found: {sam_extract}")

    chunks: list[pd.DataFrame] = []
    reader = pd.read_csv(
        sam_extract,
        sep="|",
        encoding="latin-1",
        dtype=str,
        chunksize=chunksize,
        low_memory=False,
    )
    naics_pattern = re.compile(rf"(?:^|[^0-9])(?:{'|'.join(map(re.escape, naics_codes))})(?:[^0-9]|$)")

    for chunk in tqdm(reader, desc="SAM extract chunks", unit="chunk"):
        normalized = normalize_sam_chunk(chunk)
        if normalized.empty:
            continue
        normalized = normalized[normalized["registration_status"].str.upper().eq("A")]
        normalized = normalized[normalized["naics"].str.contains(naics_pattern, na=False)]
        if state_filter:
            normalized = normalized[normalized["state"].isin(state_filter)]
        if not normalized.empty:
            chunks.append(
                normalized[
                    [
                        "uei",
                        "cage_code",
                        "state",
                        "city",
                        "zip",
                        "contact_name",
                        "contact_phone",
                        "contact_email",
                    ]
                ]
            )

    if not chunks:
        return empty_sam_frame()
    sam = pd.concat(chunks, ignore_index=True)
    sam = sam.fillna("").astype(str)
    sam["uei"] = sam["uei"].str.upper().str.strip()
    return sam.drop_duplicates("uei", keep="first")


def normalize_sam_chunk(chunk: pd.DataFrame) -> pd.DataFrame:
    column_map = {column.upper().strip(): column for column in chunk.columns}

    def value_for(target: str) -> pd.Series:
        for alias in SAM_COLUMN_ALIASES[target]:
            source = column_map.get(alias.upper())
            if source:
                return chunk[source].fillna("").astype(str).str.strip()
        return pd.Series([""] * len(chunk), index=chunk.index, dtype=str)

    first_name = value_for("first_name")
    last_name = value_for("last_name")
    contact_name = (first_name + " " + last_name).str.strip()

    return pd.DataFrame(
        {
            "uei": value_for("uei").str.upper(),
            "cage_code": value_for("cage_code").str.upper(),
            "legal_business_name": value_for("legal_business_name"),
            "state": value_for("state").str.upper(),
            "city": value_for("city"),
            "zip": value_for("zip"),
            "contact_name": contact_name,
            "contact_phone": value_for("phone"),
            "contact_email": value_for("email"),
            "naics": value_for("naics"),
            "registration_status": value_for("registration_status"),
        }
    )


def empty_sam_frame() -> pd.DataFrame:
    return pd.DataFrame(
        columns=[
            "uei",
            "cage_code",
            "state",
            "city",
            "zip",
            "contact_name",
            "contact_phone",
            "contact_email",
        ]
    )


def merge_usaspending_sam(awards: pd.DataFrame, sam: pd.DataFrame | None = None) -> pd.DataFrame:
    awards = enforce_output_schema(awards)
    if awards.empty:
        return awards
    if sam is None or sam.empty:
        return enforce_output_schema(awards)

    sam_clean = sam.copy().fillna("").astype(str)
    sam_clean["uei"] = sam_clean["uei"].str.upper().str.strip()
    sam_clean = sam_clean.rename(
        columns={
            "state": "sam_state",
            "city": "sam_city",
            "zip": "sam_zip",
        }
    )
    merged = awards.merge(sam_clean, on="uei", how="left", suffixes=("", "_sam"))
    for output_column, sam_column in [
        ("cage_code", "cage_code_sam"),
        ("contact_name", "contact_name_sam"),
        ("contact_phone", "contact_phone_sam"),
        ("contact_email", "contact_email_sam"),
    ]:
        if sam_column in merged:
            merged[output_column] = merged[sam_column].map(safe_str)
    for output_column, sam_column in [("state", "sam_state"), ("city", "sam_city"), ("zip", "sam_zip")]:
        if sam_column in merged:
            merged[output_column] = [
                current if safe_str(current) else safe_str(fallback)
                for current, fallback in zip(merged[output_column], merged[sam_column], strict=False)
            ]
    return enforce_output_schema(merged)


def filter_by_tier(suppliers: pd.DataFrame, tier: int | None) -> pd.DataFrame:
    if tier is None:
        return suppliers
    return suppliers[suppliers["sovereign_tier"].map(tier_rank) <= tier].copy()


def enforce_output_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    for column in OUTPUT_COLUMNS:
        if column not in result:
            result[column] = ""
    result = result[OUTPUT_COLUMNS]
    result = result.fillna("")
    if not result.empty:
        result["dod_award_amount"] = result["dod_award_amount"].map(parse_amount)
        result["uei"] = result["uei"].map(safe_str).str.upper()
        result["nadcap_status"] = "VERIFY eAuditNet"
        result["cmmc_status"] = "VERIFY SPRS"
        result["sovereign_tier"] = result["dod_award_amount"].map(assign_sovereign_tier)
    return result


def write_outputs(suppliers: pd.DataFrame, output: Path, write_sqlite: bool) -> None:
    suppliers = enforce_output_schema(suppliers)
    output.parent.mkdir(parents=True, exist_ok=True)
    suppliers.to_csv(output, index=False)
    if write_sqlite:
        write_sqlite_output(suppliers, Path("sovereign.db"))


def write_sqlite_output(suppliers: pd.DataFrame, sqlite_path: Path) -> None:
    with sqlite3.connect(sqlite_path) as connection:
        suppliers.to_sql("suppliers", connection, if_exists="replace", index=False)
        connection.execute("CREATE INDEX IF NOT EXISTS idx_suppliers_uei ON suppliers (uei)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_suppliers_cage_code ON suppliers (cage_code)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_suppliers_state ON suppliers (state)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_suppliers_naics_code ON suppliers (naics_code)")


def run_pipeline(
    sam_extract: Path | None,
    naics: list[str],
    state_filter: list[str],
    years: int,
    output: Path,
    write_sqlite: bool,
    tier: int | None,
) -> pd.DataFrame:
    awards = fetch_usaspending_awards(naics_codes=naics, years=years, state_filter=state_filter)
    if sam_extract:
        sam = load_sam_extract(sam_extract, naics_codes=naics, state_filter=state_filter)
    else:
        click.echo(
            "Warning: --sam-extract not provided. Running USASpending-only pipeline; "
            "CAGE/contact/ZIP fields will be blank. Download the SAM FOIA extract from "
            "https://sam.gov/data-services and pass --sam-extract data/path.csv.",
            err=True,
        )
        sam = None

    suppliers = merge_usaspending_sam(awards, sam)
    suppliers = filter_by_tier(suppliers, tier)
    suppliers = enforce_output_schema(suppliers)
    write_outputs(suppliers, output, write_sqlite)
    return suppliers


@click.command(context_settings={"help_option_names": ["--help"]})
@click.option("--sam-extract", type=click.Path(path_type=Path), help="Path to SAM FOIA extract CSV.")
@click.option("--naics", "naics_filter", type=str, help="Comma-separated NAICS filter. Defaults to all.")
@click.option("--state", "state_filter", type=str, help="Comma-separated state filter, e.g. GA,TX,CA.")
@click.option("--years", type=click.IntRange(1, 20), default=3, show_default=True)
@click.option("--output", type=click.Path(path_type=Path), help="Output CSV path.")
@click.option("--sqlite", "write_sqlite", is_flag=True, help="Also write sovereign.db SQLite output.")
@click.option("--tier", type=click.IntRange(1, 4), help="Only output suppliers at or above this tier.")
def main(
    sam_extract: Path | None,
    naics_filter: str | None,
    state_filter: str | None,
    years: int,
    output: Path | None,
    write_sqlite: bool,
    tier: int | None,
) -> None:
    """Create a legally clean starter supplier database for Sovereign Source."""
    configure_logging()
    naics = normalize_naics_filter(naics_filter)
    states = parse_csv_list(state_filter)
    output_path = output or Path(f"sovereign_db_{datetime.now(UTC):%Y%m%d}.csv")
    suppliers = run_pipeline(
        sam_extract=sam_extract,
        naics=naics,
        state_filter=states,
        years=years,
        output=output_path,
        write_sqlite=write_sqlite,
        tier=tier,
    )
    click.echo(f"Wrote {len(suppliers):,} supplier rows to {output_path}")
    if write_sqlite:
        click.echo("Wrote SQLite table suppliers to sovereign.db")


if __name__ == "__main__":
    main()
