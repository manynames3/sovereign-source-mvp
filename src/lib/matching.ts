import type {
  Capability,
  CapacitySignal,
  ComplianceEvidence,
  DemoData,
  EvidenceType,
  Facility,
  LifecycleStage,
  MatchStatus,
  Organization,
  SupplierMatch,
  SupplierProfile,
  WorkPackage,
} from "./domain";
import { controlledClassifications, evidenceLabels, processLabels } from "./domain";

const validEvidenceStatuses = new Set(["VALID", "EXPIRES_SOON"]);
const manualEvidenceStatuses = new Set(["PENDING_REVIEW", "MANUAL_REQUIRED"]);

export interface MatchingInput {
  workPackage: WorkPackage;
  organizations: Organization[];
  facilities: Facility[];
  supplierProfiles: SupplierProfile[];
  capabilities: Capability[];
  complianceEvidence: ComplianceEvidence[];
  capacitySignals: CapacitySignal[];
  now?: Date;
}

export interface MatchingSummary {
  matches: SupplierMatch[];
  counts: Record<MatchStatus, number>;
}

export function runMatching(input: MatchingInput): MatchingSummary {
  const now = input.now ?? new Date();
  const supplierOrgs = input.organizations.filter((org) => org.type === "SUPPLIER");

  const matches = supplierOrgs.flatMap((supplier) => {
    const facilities = input.facilities.filter(
      (facility) => facility.supplierOrgId === supplier.id,
    );

    if (facilities.length === 0) {
      return [
        buildMatch({
          workPackage: input.workPackage,
          supplierOrgId: supplier.id,
          facilityId: "no-facility",
          status: "INELIGIBLE",
          score: 0,
          reasons: [],
          blockers: ["No facility profile is available."],
          capacitySignals: [],
        }),
      ];
    }

    return facilities.map((facility) =>
      evaluateFacility({
        ...input,
        supplierOrg: supplier,
        facility,
        now,
      }),
    );
  });

  const sorted = matches.sort((a, b) => {
    const statusRank: Record<MatchStatus, number> = {
      ELIGIBLE: 0,
      MANUAL_REVIEW: 1,
      INELIGIBLE: 2,
    };
    return statusRank[a.eligibilityStatus] - statusRank[b.eligibilityStatus] || b.score - a.score;
  });

  return {
    matches: sorted,
    counts: {
      ELIGIBLE: sorted.filter((match) => match.eligibilityStatus === "ELIGIBLE").length,
      MANUAL_REVIEW: sorted.filter((match) => match.eligibilityStatus === "MANUAL_REVIEW").length,
      INELIGIBLE: sorted.filter((match) => match.eligibilityStatus === "INELIGIBLE").length,
    },
  };
}

export function runMatchingForWorkPackage(
  workPackageId: string,
  data: DemoData,
  now?: Date,
): MatchingSummary {
  const workPackage = data.workPackages.find((candidate) => candidate.id === workPackageId);
  if (!workPackage) {
    throw new Error(`Work package ${workPackageId} was not found.`);
  }

  return runMatching({
    workPackage,
    organizations: data.organizations,
    facilities: data.facilities,
    supplierProfiles: data.supplierProfiles,
    capabilities: data.capabilities,
    complianceEvidence: data.complianceEvidence,
    capacitySignals: data.capacitySignals,
    now,
  });
}

function evaluateFacility(input: MatchingInput & {
  supplierOrg: Organization;
  facility: Facility;
  now: Date;
}): SupplierMatch {
  const { workPackage, supplierOrg, facility, now } = input;
  const blockers: string[] = [];
  const reasons: string[] = [];
  const manualReview: string[] = [];

  if (workPackage.dataClassification === "UNKNOWN") {
    blockers.push("Work package classification is unknown.");
  }

  if (!workPackage.classificationApprovedAt || !workPackage.classificationApprovedBy) {
    blockers.push("Buyer-side classification approval is required before matching.");
  }

  if (!facility.isActive) {
    blockers.push("Facility is inactive.");
  }

  const facilityCapabilities = input.capabilities.filter(
    (capability) => capability.facilityId === facility.id,
  );
  const bestCapability = pickBestCapability(workPackage, facilityCapabilities);

  if (!bestCapability) {
    blockers.push(
      `Missing required process: ${workPackage.requiredProcesses.map((p) => processLabels[p]).join(", ")}.`,
    );
  } else {
    reasons.push(`Process fit: ${processLabels[bestCapability.processType]}.`);

    const missingMaterials = workPackage.requiredMaterials.filter(
      (material) => !bestCapability.materials.includes(material),
    );
    if (missingMaterials.length > 0) {
      blockers.push(`Material mismatch: ${missingMaterials.join(", ")}.`);
    } else if (workPackage.requiredMaterials.length > 0) {
      reasons.push(`Material fit: ${workPackage.requiredMaterials.join(", ")}.`);
    }

    if (
      typeof workPackage.toleranceRequiredInches === "number" &&
      bestCapability.toleranceMinInches > workPackage.toleranceRequiredInches
    ) {
      blockers.push(
        `Tolerance mismatch: requires +/-${workPackage.toleranceRequiredInches.toFixed(4)} in, capability is +/-${bestCapability.toleranceMinInches.toFixed(4)} in.`,
      );
    } else if (typeof workPackage.toleranceRequiredInches === "number") {
      reasons.push(
        `Tolerance fit: capability reaches +/-${bestCapability.toleranceMinInches.toFixed(4)} in.`,
      );
    }

    if (
      workPackage.quantity < bestCapability.quantityMin ||
      workPackage.quantity > bestCapability.quantityMax
    ) {
      blockers.push(
        `Quantity mismatch: RFQ quantity ${workPackage.quantity} outside ${bestCapability.quantityMin}-${bestCapability.quantityMax}.`,
      );
    }

    const missingInspection = workPackage.requiredInspection.filter(
      (inspection) => !bestCapability.inspectionCapabilities.includes(inspection),
    );
    if (missingInspection.length > 0) {
      blockers.push(`Inspection mismatch: ${missingInspection.join(", ")}.`);
    }
  }

  for (const requiredType of requiredEvidenceFor(workPackage)) {
    const evidenceResult = evaluateEvidence({
      evidenceType: requiredType,
      supplierOrgId: supplierOrg.id,
      facilityId: facility.id,
      evidence: input.complianceEvidence,
      now,
    });

    if (evidenceResult.status === "missing") {
      blockers.push(`Missing compliance evidence: ${evidenceLabels[requiredType]}.`);
    }

    if (evidenceResult.status === "blocked") {
      blockers.push(evidenceResult.reason);
    }

    if (evidenceResult.status === "manual") {
      manualReview.push(evidenceResult.reason);
    }

    if (evidenceResult.status === "valid") {
      reasons.push(evidenceResult.reason);
    }
  }

  const profile = input.supplierProfiles.find(
    (candidate) => candidate.supplierOrgId === supplierOrg.id,
  );
  const capacity = summarizeCapacity(
    input.capacitySignals.filter(
      (signal) => signal.supplierOrgId === supplierOrg.id && signal.facilityId === facility.id,
    ),
  );

  const lifecycleScore = profile
    ? lifecycleStageScore(workPackage.lifecycleStageTarget, profile.lifecycleStage)
    : 0;
  const capacityScore = capacity.score;
  const customerApprovedBonus = hasValidEvidence(
    input.complianceEvidence,
    supplierOrg.id,
    facility.id,
    "CUSTOMER_APPROVED",
    now,
  )
    ? 8
    : 0;
  const baseScore = bestCapability ? 50 : 0;
  const score = Math.max(
    0,
    Math.min(100, baseScore + lifecycleScore + capacityScore + customerApprovedBonus),
  );

  if (profile) {
    reasons.push(`Lifecycle fit: ${profile.lifecycleStage.replace("_", " ").toLowerCase()}.`);
  }
  if (capacity.summary.length > 0) {
    reasons.push(`Capacity Confidence uses ${capacity.summary.length} signal(s), not live machine availability.`);
  }

  let status: MatchStatus = "ELIGIBLE";
  if (blockers.length > 0) {
    status = "INELIGIBLE";
  } else if (manualReview.length > 0) {
    status = "MANUAL_REVIEW";
  }

  return buildMatch({
    workPackage,
    supplierOrgId: supplierOrg.id,
    facilityId: facility.id,
    status,
    score: status === "INELIGIBLE" ? Math.min(score, 44) : score,
    reasons: [...reasons, ...manualReview],
    blockers,
    capacitySignals: capacity.summary,
  });
}

function pickBestCapability(workPackage: WorkPackage, capabilities: Capability[]) {
  const matchingProcess = capabilities.filter((capability) =>
    workPackage.requiredProcesses.includes(capability.processType),
  );

  return matchingProcess.sort((a, b) => a.toleranceMinInches - b.toleranceMinInches)[0];
}

function requiredEvidenceFor(workPackage: WorkPackage): EvidenceType[] {
  const required = new Set(workPackage.requiredCompliance);

  if (
    controlledClassifications.includes(workPackage.dataClassification) &&
    (workPackage.dataClassification === "ITAR_TECHNICAL_DATA" ||
      workPackage.dataClassification === "JCP_REQUIRED")
  ) {
    required.add("ITAR_REGISTRATION_EVIDENCE");
    required.add("JCP_DD2345");
  }

  return Array.from(required);
}

function evaluateEvidence(input: {
  evidenceType: EvidenceType;
  supplierOrgId: string;
  facilityId: string;
  evidence: ComplianceEvidence[];
  now: Date;
}):
  | { status: "valid"; reason: string }
  | { status: "manual"; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "missing" } {
  const relevant = input.evidence.filter(
    (evidence) =>
      evidence.supplierOrgId === input.supplierOrgId &&
      evidence.type === input.evidenceType &&
      (!evidence.facilityId || evidence.facilityId === input.facilityId),
  );

  if (relevant.length === 0) {
    return { status: "missing" };
  }

  const best = relevant.sort((a, b) => statusPriority(a.status) - statusPriority(b.status))[0];

  if (!best) {
    return { status: "missing" };
  }

  const expiration = best.expirationDate ? new Date(best.expirationDate) : undefined;
  if (expiration && expiration.getTime() < input.now.getTime()) {
    return {
      status: "blocked",
      reason: `${evidenceLabels[input.evidenceType]} is expired; access suspended.`,
    };
  }

  if (validEvidenceStatuses.has(best.status)) {
    return {
      status: "valid",
      reason: `${evidenceLabels[input.evidenceType]} evidence valid for scope: ${best.scopeText}.`,
    };
  }

  if (manualEvidenceStatuses.has(best.status)) {
    return {
      status: "manual",
      reason: `${evidenceLabels[input.evidenceType]} requires manual review for scope: ${best.scopeText}.`,
    };
  }

  return {
    status: "blocked",
    reason: `${evidenceLabels[input.evidenceType]} status is ${best.status.replaceAll("_", " ").toLowerCase()}.`,
  };
}

function statusPriority(status: ComplianceEvidence["status"]) {
  const priority: Record<ComplianceEvidence["status"], number> = {
    VALID: 0,
    EXPIRES_SOON: 1,
    MANUAL_REQUIRED: 2,
    PENDING_REVIEW: 3,
    EXPIRED: 4,
    REJECTED: 5,
  };
  return priority[status];
}

function hasValidEvidence(
  evidence: ComplianceEvidence[],
  supplierOrgId: string,
  facilityId: string,
  evidenceType: EvidenceType,
  now: Date,
) {
  return (
    evaluateEvidence({
      evidenceType,
      supplierOrgId,
      facilityId,
      evidence,
      now,
    }).status === "valid"
  );
}

function lifecycleStageScore(target: LifecycleStage, actual: LifecycleStage) {
  if (target === actual) {
    return 16;
  }
  if (target === "SCALING" && actual === "MASS_PRODUCTION") {
    return 12;
  }
  if (target === "DEVELOPMENTAL" && actual === "SCALING") {
    return 10;
  }
  return 5;
}

function summarizeCapacity(signals: CapacitySignal[]) {
  if (signals.length === 0) {
    return { score: 4, summary: ["No recent capacity signal; confidence is low."] };
  }

  const summary = signals.map((signal) => {
    if (signal.signalType === "DECLARED_AVAILABILITY") {
      return `Declared availability: ${String(signal.valueJson.status)} (${String(signal.valueJson.confidence)} confidence).`;
    }
    if (signal.signalType === "QUOTED_LEAD_TIME") {
      return `Quoted lead-time history: ${String(signal.valueJson.days)} days.`;
    }
    if (signal.signalType === "RFQ_RESPONSE_TIME") {
      return `Median RFQ response: ${String(signal.valueJson.medianHours)} hours.`;
    }
    if (signal.signalType === "NO_BID_REASON") {
      return `No-bid signal: ${String(signal.valueJson.ratePercent)}% with ${String(signal.valueJson.commonReason)} noted.`;
    }
    return `${signal.signalType.replaceAll("_", " ").toLowerCase()} signal observed.`;
  });

  const declared = signals.find((signal) => signal.signalType === "DECLARED_AVAILABILITY");
  const quotedLeadTime = signals.find((signal) => signal.signalType === "QUOTED_LEAD_TIME");
  const noBid = signals.find((signal) => signal.signalType === "NO_BID_REASON");

  let score = 10;
  if (declared && Number(declared.valueJson.confidence) >= 80) {
    score += 16;
  } else if (declared && Number(declared.valueJson.confidence) >= 60) {
    score += 9;
  }
  if (quotedLeadTime && Number(quotedLeadTime.valueJson.days) > 70) {
    score -= 12;
  }
  if (noBid && Number(noBid.valueJson.ratePercent) >= 30) {
    score -= 8;
  }

  return { score, summary };
}

function buildMatch(input: {
  workPackage: WorkPackage;
  supplierOrgId: string;
  facilityId: string;
  status: MatchStatus;
  score: number;
  reasons: string[];
  blockers: string[];
  capacitySignals: string[];
}): SupplierMatch {
  return {
    id: `match-${input.workPackage.id}-${input.supplierOrgId}-${input.facilityId}`,
    workPackageId: input.workPackage.id,
    supplierOrgId: input.supplierOrgId,
    facilityId: input.facilityId,
    eligibilityStatus: input.status,
    score: Math.round(input.score),
    reasons: input.reasons,
    blockers: input.blockers,
    capacitySignals: input.capacitySignals,
    createdAt: new Date().toISOString(),
  };
}
