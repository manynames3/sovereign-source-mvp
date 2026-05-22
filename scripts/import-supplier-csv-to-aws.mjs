#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { BatchWriteItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";

const PROCESS_BY_NAICS = {
  "332811": {
    processType: "HEAT_TREAT",
    materials: ["Steel", "Stainless", "Titanium", "Aluminum"],
    inspectionCapabilities: ["VERIFY Nadcap heat treat scope", "VERIFY customer approval"],
  },
  "332812": {
    processType: "COATING",
    materials: ["Steel", "Stainless", "Aluminum", "Titanium"],
    inspectionCapabilities: ["VERIFY coating scope", "VERIFY Nadcap if required"],
  },
  "332813": {
    processType: "COATING",
    materials: ["Aluminum", "Stainless", "Copper", "Brass"],
    inspectionCapabilities: ["VERIFY plating/anodizing scope", "VERIFY Nadcap if required"],
  },
  "332999": {
    processType: "SHEET_METAL",
    materials: ["Steel", "Stainless", "Aluminum"],
    inspectionCapabilities: ["VERIFY dimensional inspection", "VERIFY quality system"],
  },
  "336411": {
    processType: "OTHER",
    materials: ["Aluminum", "Titanium", "Composites", "Stainless"],
    inspectionCapabilities: ["VERIFY aerospace quality system", "VERIFY controlled-work scope"],
  },
  "336412": {
    processType: "CNC_5_AXIS",
    materials: ["Titanium", "Inconel", "Aluminum", "Stainless"],
    inspectionCapabilities: ["VERIFY CMM", "VERIFY FAIR", "VERIFY aerospace quality system"],
  },
  "336413": {
    processType: "CNC_5_AXIS",
    materials: ["Aluminum", "Titanium", "Stainless", "Inconel"],
    inspectionCapabilities: ["VERIFY CMM", "VERIFY FAIR", "VERIFY aerospace quality system"],
  },
  "336992": {
    processType: "OTHER",
    materials: ["Steel", "Armor steel", "Aluminum"],
    inspectionCapabilities: ["VERIFY military vehicle scope", "VERIFY controlled-work scope"],
  },
  "334511": {
    processType: "OTHER",
    materials: ["Electronics assemblies", "Aluminum", "Stainless"],
    inspectionCapabilities: ["VERIFY test capability", "VERIFY controlled-work scope"],
  },
  "541380": {
    processType: "NDT",
    materials: ["Metals", "Composites"],
    inspectionCapabilities: ["VERIFY lab accreditation", "VERIFY NDT method scope"],
  },
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

export function buildSupplierImportItems(rows, options) {
  const now = options.now ?? new Date().toISOString();
  const importId = options.importId ?? createImportId();
  const importS3Key = options.importS3Key ?? "";
  const sourceFilename = options.sourceFilename ?? "";
  const tenantId = options.tenantId;
  const items = [];
  const rowSummaries = [];

  rows.forEach((row, rowIndex) => {
    const normalized = normalizeRow(row);
    if (!normalized.companyName) {
      return;
    }

    const stableKey = normalized.uei || normalized.cageCode || `${normalized.companyName}-${normalized.state}-${normalized.city}`;
    const supplierId = stableId("supplier", stableKey);
    const facilityId = stableId("facility", stableKey);
    const profileId = stableId("profile", stableKey);
    const capabilityId = stableId("capability", `${stableKey}-${normalized.naicsCode || "unknown"}`);
    const registryCheckId = stableId("registry", `${stableKey}-${importId}`);
    const capacitySignalId = stableId("capacity", `${stableKey}-${normalized.awardId || "award"}`);
    const naicsCapability = PROCESS_BY_NAICS[normalized.naicsCode] ?? {
      processType: "OTHER",
      materials: ["Metals"],
      inspectionCapabilities: ["VERIFY process capability", "VERIFY quality system"],
    };
    const provenance = {
      sourceSystem: "SAM_GOV_USASPENDING",
      sourceFilename,
      importId,
      importS3Key,
      rowNumber: rowIndex + 2,
      pulledAt: normalized.pulledAt,
      uei: normalized.uei,
      cageCode: normalized.cageCode,
      naicsCode: normalized.naicsCode,
      naicsLabel: normalized.naicsLabel,
      awardId: normalized.awardId,
      awardingAgency: normalized.awardingAgency,
      dodAwardAmount: normalized.dodAwardAmount,
      sovereignTier: normalized.sovereignTier,
      verificationPlaceholders: {
        nadcap: "VERIFY eAuditNet",
        cmmc: "VERIFY SPRS",
      },
    };

    const organization = {
      id: supplierId,
      name: normalized.companyName,
      type: "SUPPLIER",
      cageCode: normalized.cageCode || undefined,
      uei: normalized.uei || undefined,
      country: "US",
      state: normalized.state || undefined,
      createdAt: now,
      updatedAt: now,
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    };

    const profile = {
      id: profileId,
      supplierOrgId: supplierId,
      lifecycleStage: lifecycleStageForTier(normalized.sovereignTier),
      summary: [
        `${normalized.companyName} was imported from the SAM.gov / USASpending starter supplier pipeline.`,
        normalized.naicsLabel ? `Primary NAICS signal: ${normalized.naicsCode} ${normalized.naicsLabel}.` : "",
        "Facility capability and compliance evidence require buyer review before controlled RFQ release.",
      ]
        .filter(Boolean)
        .join(" "),
      primaryContact: normalized.contactName || normalized.contactEmail || "VERIFY SAM.gov POC",
      status: "NEEDS_REVIEW",
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    };

    const facility = {
      id: facilityId,
      supplierOrgId: supplierId,
      name: `${normalized.companyName} primary facility`,
      address: facilityAddress(normalized),
      country: "US",
      state: normalized.state || undefined,
      cageCode: normalized.cageCode || undefined,
      isActive: true,
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    };

    const capability = {
      id: capabilityId,
      facilityId,
      processType: naicsCapability.processType,
      materials: naicsCapability.materials,
      toleranceMinInches: 0.005,
      maxPartSize: "VERIFY facility envelope",
      quantityMin: 1,
      quantityMax: quantityMaxForTier(normalized.sovereignTier),
      inspectionCapabilities: naicsCapability.inspectionCapabilities,
      notes: `Inferred from NAICS ${normalized.naicsCode || "unknown"} and DOD award history. Manual review required before matching controlled work.`,
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    };

    const registryCheck = {
      id: registryCheckId,
      supplierOrgId: supplierId,
      type: "SAM_USASPENDING_IMPORT",
      status: "IMPORTED_NEEDS_REVIEW",
      rawResultJson: {
        row: normalized.original,
        provenance,
      },
      checkedAt: now,
    };

    const capacitySignal = {
      id: capacitySignalId,
      supplierOrgId: supplierId,
      facilityId,
      signalType: "DELIVERY_HISTORY",
      valueJson: {
        source: "USASpending",
        dodAwardAmount: normalized.dodAwardAmount,
        awardId: normalized.awardId,
        awardingAgency: normalized.awardingAgency,
        sovereignTier: normalized.sovereignTier,
      },
      observedAt: now,
    };

    const evidence = buildEvidenceRecords({
      stableKey,
      supplierId,
      facilityId,
      normalized,
      provenance,
      now,
    });

    items.push(
      tenantItem(tenantId, "organization", `ORG#${organization.id}`, organization),
      tenantItem(tenantId, "supplierProfile", `SUPPLIER_PROFILE#${profile.id}`, profile),
      tenantItem(tenantId, "facility", `FACILITY#${facility.id}`, facility),
      tenantItem(tenantId, "capability", `CAPABILITY#${capability.id}`, capability),
      tenantItem(tenantId, "registryCheck", `REGISTRY#${registryCheck.id}`, registryCheck),
      tenantItem(tenantId, "capacitySignal", `CAPACITY#${capacitySignal.id}`, capacitySignal),
      ...evidence.map((record) => tenantItem(tenantId, "evidence", `EVIDENCE#${record.id}`, record)),
    );

    rowSummaries.push({
      supplierId,
      name: normalized.companyName,
      uei: normalized.uei,
      cageCode: normalized.cageCode,
      naicsCode: normalized.naicsCode,
      evidencePlaceholders: ["VERIFY eAuditNet", "VERIFY SPRS"],
    });
  });

  const supplierRecordItemCount = items.length;
  const totalDynamoItemCount = supplierRecordItemCount + 2;
  const audit = {
    id: stableId("audit", importId),
    action: "SUPPLIER_OPEN_DATA_IMPORT",
    entityType: "SupplierImport",
    entityId: importId,
    orgId: tenantId,
    metadataJson: {
      sourceSystem: "SAM_GOV_USASPENDING",
      sourceFilename,
      importS3Key,
      importedSupplierCount: rowSummaries.length,
      supplierRecordItemCount,
      totalDynamoItemCount,
      verificationPlaceholders: ["VERIFY eAuditNet", "VERIFY SPRS"],
    },
    createdAt: now,
  };

  items.push(tenantItem(tenantId, "supplierImport", `IMPORT#${importId}`, {
    id: importId,
    sourceSystem: "SAM_GOV_USASPENDING",
    sourceFilename,
    importS3Key,
    importedSupplierCount: rowSummaries.length,
    importedItemCount: totalDynamoItemCount,
    supplierRecordItemCount,
    totalDynamoItemCount,
    verificationPlaceholders: ["VERIFY eAuditNet", "VERIFY SPRS"],
    createdAt: now,
  }));
  items.push(tenantItem(tenantId, "audit", `AUDIT#${audit.createdAt}#${audit.id}`, audit));

  return { importId, items, rowSummaries };
}

function buildEvidenceRecords({ stableKey, supplierId, facilityId, normalized, provenance, now }) {
  return [
    {
      id: stableId("evidence", `${stableKey}-sam-active`),
      supplierOrgId: supplierId,
      facilityId,
      type: "SAM_ACTIVE",
      status: "PENDING_REVIEW",
      source: "REGISTRY",
      scopeText: "SAM.gov registration signal imported from the open-data supplier pipeline.",
      issuingBody: "SAM.gov",
      reviewedAt: now,
      notes: "Manual review required before this evidence can release controlled RFQ data.",
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    },
    {
      id: stableId("evidence", `${stableKey}-sam-exclusion`),
      supplierOrgId: supplierId,
      facilityId,
      type: "SAM_EXCLUSION_CLEAR",
      status: "MANUAL_REQUIRED",
      source: "MANUAL_REVIEW",
      scopeText: "Verify SAM.gov exclusions before controlled RFQ release.",
      issuingBody: "SAM.gov",
      notes: "Import does not certify exclusion status. Manual review required.",
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    },
    {
      id: stableId("evidence", `${stableKey}-nadcap`),
      supplierOrgId: supplierId,
      facilityId,
      type: "NADCAP",
      status: "MANUAL_REQUIRED",
      source: "MANUAL_REVIEW",
      scopeText: "VERIFY eAuditNet for Nadcap scope before routing controlled RFQs.",
      issuingBody: "eAuditNet",
      notes: normalized.nadcapStatus || "VERIFY eAuditNet",
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    },
    {
      id: stableId("evidence", `${stableKey}-cmmc`),
      supplierOrgId: supplierId,
      facilityId,
      type: "CMMC_LEVEL_2",
      status: "MANUAL_REQUIRED",
      source: "MANUAL_REVIEW",
      scopeText: "VERIFY SPRS for CMMC / NIST 800-171 status before CUI release.",
      issuingBody: "SPRS",
      notes: normalized.cmmcStatus || "VERIFY SPRS",
      sourceSystem: "SAM_GOV_USASPENDING",
      provenanceJson: provenance,
    },
  ];
}

function normalizeRow(row) {
  return {
    original: row,
    companyName: stringValue(row.company_name),
    uei: stringValue(row.uei).toUpperCase(),
    cageCode: stringValue(row.cage_code).toUpperCase(),
    naicsCode: stringValue(row.naics_code),
    naicsLabel: stringValue(row.naics_label),
    state: stringValue(row.state).toUpperCase(),
    city: stringValue(row.city),
    zip: stringValue(row.zip),
    contactName: stringValue(row.contact_name),
    contactPhone: stringValue(row.contact_phone),
    contactEmail: stringValue(row.contact_email).toLowerCase(),
    dodAwardAmount: numberValue(row.dod_award_amount),
    awardingAgency: stringValue(row.awarding_agency),
    awardId: stringValue(row.award_id),
    nadcapStatus: stringValue(row.nadcap_status) || "VERIFY eAuditNet",
    cmmcStatus: stringValue(row.cmmc_status) || "VERIFY SPRS",
    sovereignTier: stringValue(row.sovereign_tier),
    pulledAt: stringValue(row.pulled_at),
  };
}

function tenantItem(tenantId, kind, sk, item) {
  return removeUndefined({
    pk: `TENANT#${tenantId}`,
    sk,
    kind,
    tenantId,
    ...item,
  });
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function stringValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function numberValue(value) {
  const normalized = stringValue(value).replace(/[$,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableId(prefix, value) {
  const digest = createHash("sha1").update(String(value).toLowerCase()).digest("hex").slice(0, 14);
  return `${prefix}-${digest}`;
}

function createImportId() {
  return `supplier-import-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
}

function lifecycleStageForTier(tier) {
  if (tier.includes("Tier 1")) {
    return "MASS_PRODUCTION";
  }
  if (tier.includes("Tier 2") || tier.includes("Tier 3")) {
    return "SCALING";
  }
  return "DEVELOPMENTAL";
}

function quantityMaxForTier(tier) {
  if (tier.includes("Tier 1")) {
    return 10000;
  }
  if (tier.includes("Tier 2")) {
    return 2500;
  }
  if (tier.includes("Tier 3")) {
    return 500;
  }
  return 100;
}

function facilityAddress(row) {
  const cityState = [row.city, row.state].filter(Boolean).join(", ");
  const location = [cityState, row.zip].filter(Boolean).join(" ");
  return location || "VERIFY SAM.gov physical address";
}

async function uploadCsv({ region, bucket, key, csvPath, importId }) {
  const body = await readFile(csvPath);
  const s3 = new S3Client({ region });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/csv",
      Metadata: {
        "source-system": "sam-gov-usaspending",
        "import-id": importId,
      },
    }),
  );
  return body.length;
}

async function batchWriteItems({ region, tableName, items }) {
  const ddb = new DynamoDBClient({ region });
  let written = 0;
  for (let index = 0; index < items.length; index += 25) {
    let requestItems = {
      [tableName]: items.slice(index, index + 25).map((item) => ({
        PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) },
      })),
    };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await ddb.send(new BatchWriteItemCommand({ RequestItems: requestItems }));
      const unprocessed = response.UnprocessedItems?.[tableName] ?? [];
      if (unprocessed.length === 0) {
        written += requestItems[tableName].length;
        break;
      }
      requestItems = { [tableName]: unprocessed };
      await sleep(2 ** attempt * 100);
      if (attempt === 5) {
        throw new Error(`DynamoDB left ${unprocessed.length} unprocessed write(s).`);
      }
    }
  }
  return written;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function parseArgs(argv) {
  const args = {
    region: process.env.AWS_REGION ?? "us-east-1",
    table: process.env.DYNAMODB_TABLE ?? "",
    bucket: process.env.DOCUMENT_BUCKET ?? "",
    tenantId: "org-buyer",
    csv: "",
    importPrefix: "imports/suppliers",
    limit: 0,
    apply: false,
    upload: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--region") args.region = next();
    else if (arg === "--table") args.table = next();
    else if (arg === "--bucket") args.bucket = next();
    else if (arg === "--tenant-id") args.tenantId = next();
    else if (arg === "--csv") args.csv = next();
    else if (arg === "--import-prefix") args.importPrefix = next();
    else if (arg === "--limit") args.limit = Number(next());
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--no-upload") args.upload = false;
    else if (arg === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-supplier-csv-to-aws.mjs --csv data/sovereign_db.csv --table TABLE --bucket BUCKET --tenant-id org-buyer --apply

Options:
  --csv PATH             CSV from sovereign_starter_db.py
  --table NAME           DynamoDB single-table name
  --bucket NAME          Private S3 bucket for provenance CSV upload
  --tenant-id ID         Tenant id to import into, default org-buyer
  --region REGION        AWS region, default us-east-1
  --limit N              Import only first N rows after CSV parsing
  --no-upload            Do not upload the CSV to S3
  --apply                Write to S3/DynamoDB. Without this, dry-run only.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.csv) {
    throw new Error("--csv is required.");
  }
  if (args.apply && !args.table) {
    throw new Error("--table is required with --apply.");
  }
  if (args.apply && args.upload && !args.bucket) {
    throw new Error("--bucket is required with --apply unless --no-upload is used.");
  }

  const csvText = await readFile(args.csv, "utf8");
  const allRows = parseCsv(csvText);
  const rows = args.limit > 0 ? allRows.slice(0, args.limit) : allRows;
  const importId = createImportId();
  const importS3Key = args.upload ? `${args.importPrefix}/${args.tenantId}/${importId}-${basename(args.csv)}` : "";
  const { items, rowSummaries } = buildSupplierImportItems(rows, {
    tenantId: args.tenantId,
    importId,
    importS3Key,
    sourceFilename: basename(args.csv),
  });

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    sourceRows: allRows.length,
    selectedRows: rows.length,
    suppliers: rowSummaries.length,
    dynamoItems: items.length,
    tenantId: args.tenantId,
    table: args.table || null,
    bucket: args.bucket || null,
    importS3Key: importS3Key || null,
    sampleSuppliers: rowSummaries.slice(0, 5),
  };

  if (!args.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  let uploadedBytes = 0;
  if (args.upload) {
    uploadedBytes = await uploadCsv({
      region: args.region,
      bucket: args.bucket,
      key: importS3Key,
      csvPath: args.csv,
      importId,
    });
  }
  const writtenItems = await batchWriteItems({ region: args.region, tableName: args.table, items });
  console.log(JSON.stringify({ ...summary, uploadedBytes, writtenItems }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
