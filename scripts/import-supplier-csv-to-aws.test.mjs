import { describe, expect, it } from "vitest";
import { buildSupplierImportItems, parseCsv } from "./import-supplier-csv-to-aws.mjs";

describe("supplier CSV AWS import mapping", () => {
  it("parses quoted CSV fields", () => {
    const rows = parseCsv('company_name,uei,dod_award_amount\n"Vector, Inc.",UEI123,"1,250,000"\n');

    expect(rows).toEqual([
      {
        company_name: "Vector, Inc.",
        uei: "UEI123",
        dod_award_amount: "1,250,000",
      },
    ]);
  });

  it("builds tenant-scoped DynamoDB items with provenance and verification placeholders", () => {
    const rows = [
      {
        company_name: "Vector Aero",
        uei: "UEI123",
        cage_code: "4VCTR",
        naics_code: "336413",
        naics_label: "Other Aircraft Parts",
        state: "OH",
        city: "Dayton",
        zip: "45402",
        contact_name: "Cal Rivers",
        contact_email: "cal@example.test",
        dod_award_amount: "1250000",
        awarding_agency: "Department of Defense",
        award_id: "W9123",
        nadcap_status: "VERIFY eAuditNet",
        cmmc_status: "VERIFY SPRS",
        sovereign_tier: "Tier 2 (Mid)",
        pulled_at: "2026-05-22",
      },
    ];

    const { items, rowSummaries } = buildSupplierImportItems(rows, {
      tenantId: "org-buyer",
      importId: "import-test",
      importS3Key: "imports/suppliers/org-buyer/import-test.csv",
      sourceFilename: "import-test.csv",
      now: "2026-05-22T12:00:00.000Z",
    });

    expect(rowSummaries).toHaveLength(1);
    expect(items.every((item) => item.pk === "TENANT#org-buyer")).toBe(true);
    expect(items.some((item) => item.kind === "supplierImport")).toBe(true);
    expect(items.some((item) => item.kind === "audit" && item.action === "SUPPLIER_OPEN_DATA_IMPORT")).toBe(true);

    const organization = items.find((item) => item.kind === "organization");
    expect(organization).toMatchObject({
      name: "Vector Aero",
      type: "SUPPLIER",
      cageCode: "4VCTR",
      uei: "UEI123",
      sourceSystem: "SAM_GOV_USASPENDING",
    });
    expect(organization.provenanceJson.verificationPlaceholders).toEqual({
      nadcap: "VERIFY eAuditNet",
      cmmc: "VERIFY SPRS",
    });

    const evidence = items.filter((item) => item.kind === "evidence");
    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "NADCAP",
          status: "MANUAL_REQUIRED",
          notes: "VERIFY eAuditNet",
        }),
        expect.objectContaining({
          type: "CMMC_LEVEL_2",
          status: "MANUAL_REQUIRED",
          notes: "VERIFY SPRS",
        }),
      ]),
    );
  });
});
