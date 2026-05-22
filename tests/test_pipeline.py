from pathlib import Path

import pandas as pd

from sovereign_starter_db import (
    OUTPUT_COLUMNS,
    assign_sovereign_tier,
    deduplicate_usaspending_awards,
    enforce_output_schema,
    load_sam_extract,
    merge_usaspending_sam,
)


def test_assign_sovereign_tier_boundaries():
    assert assign_sovereign_tier(10_000_000) == "Tier 1 (Prime)"
    assert assign_sovereign_tier(1_000_000) == "Tier 2 (Mid)"
    assert assign_sovereign_tier(100_000) == "Tier 3 (Small)"
    assert assign_sovereign_tier(99_999) == "Tier 4 (Emerging)"


def test_deduplicate_keeps_highest_award_by_uei():
    awards = enforce_output_schema(
        pd.DataFrame(
            [
                {
                    "company_name": "Low Award Co",
                    "uei": "ABC123",
                    "naics_code": "332811",
                    "dod_award_amount": 250_000,
                    "award_id": "low",
                },
                {
                    "company_name": "High Award Co",
                    "uei": "ABC123",
                    "naics_code": "332811",
                    "dod_award_amount": 2_500_000,
                    "award_id": "high",
                },
            ]
        )
    )

    deduped = deduplicate_usaspending_awards(awards)

    assert len(deduped) == 1
    assert deduped.iloc[0]["company_name"] == "High Award Co"
    assert deduped.iloc[0]["award_id"] == "high"


def test_merge_usaspending_sam_fills_contacts_and_keeps_schema():
    awards = enforce_output_schema(
        pd.DataFrame(
            [
                {
                    "company_name": "Vector Aero",
                    "uei": "UEI123",
                    "naics_code": "336413",
                    "state": "",
                    "city": "",
                    "dod_award_amount": 12_000_000,
                    "award_id": "W9123",
                }
            ]
        )
    )
    sam = pd.DataFrame(
        [
            {
                "uei": "UEI123",
                "cage_code": "4VCTR",
                "state": "OH",
                "city": "Dayton",
                "zip": "45402",
                "contact_name": "Cal Rivers",
                "contact_phone": "555-0100",
                "contact_email": "cal@example.test",
            }
        ]
    )

    merged = merge_usaspending_sam(awards, sam)

    assert list(merged.columns) == OUTPUT_COLUMNS
    assert merged.iloc[0]["cage_code"] == "4VCTR"
    assert merged.iloc[0]["state"] == "OH"
    assert merged.iloc[0]["contact_name"] == "Cal Rivers"
    assert merged.iloc[0]["nadcap_status"] == "VERIFY eAuditNet"
    assert merged.iloc[0]["cmmc_status"] == "VERIFY SPRS"


def test_missing_sam_extract_handling_returns_blank_fields():
    awards = enforce_output_schema(
        pd.DataFrame(
            [
                {
                    "company_name": "USASpending Only",
                    "uei": "UEI999",
                    "naics_code": "541380",
                    "state": "CA",
                    "city": "001",
                    "dod_award_amount": 99_000,
                }
            ]
        )
    )

    merged = merge_usaspending_sam(awards, None)

    assert list(merged.columns) == OUTPUT_COLUMNS
    assert merged.iloc[0]["cage_code"] == ""
    assert merged.iloc[0]["contact_email"] == ""
    assert merged.isna().sum().sum() == 0


def test_load_sam_extract_filters_active_target_naics(tmp_path: Path):
    sam_file = tmp_path / "sam_extract.csv"
    sam_file.write_text(
        "|".join(
            [
                "CAGE CODE",
                "UEI SAM",
                "LEGAL BUSINESS NAME",
                "PHYSICAL ADDRESS STATE",
                "PHYSICAL ADDRESS CITY",
                "PHYSICAL ADDRESS ZIP CODE",
                "GOVT BUS POC FIRST NAME",
                "GOVT BUS POC LAST NAME",
                "GOVT BUS POC US PHONE",
                "GOVT BUS POC EMAIL",
                "NAICS CODE STRING",
                "REGISTRATION STATUS",
            ]
        )
        + "\n"
        + "4VCTR|UEI123|Vector Aero|OH|Dayton|45402|Cal|Rivers|555-0100|cal@example.test|336413,332811|A\n"
        + "7OLD|UEI777|Old Supplier|TX|Austin|73301|Pat|Lee|555-0101|pat@example.test|336413|I\n"
        + "8MISS|UEI888|Wrong NAICS|CA|Irvine|92602|Jo|Kim|555-0102|jo@example.test|722511|A\n",
        encoding="latin-1",
    )

    sam = load_sam_extract(sam_file, ["336413"], chunksize=1)

    assert len(sam) == 1
    assert sam.iloc[0]["uei"] == "UEI123"
    assert sam.iloc[0]["contact_name"] == "Cal Rivers"
