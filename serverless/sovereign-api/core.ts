import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  AuditLog,
  Capability,
  CapacitySignal,
  ComplianceEvidence,
  DocumentRecord,
  Facility,
  Organization,
  RFQInvite,
  SupplierMatch,
  SupplierProfile,
  UserRole,
  WorkPackage,
} from "../../src/lib/domain";
import { controlledClassifications } from "../../src/lib/domain";
import { runMatching } from "../../src/lib/matching";

export type CurrentUser = {
  userId: string;
  email?: string;
  tenantId?: string;
  roles: UserRole[];
};

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const buyerWriteRoles: UserRole[] = ["BUYER_ADMIN", "BUYER_PROCUREMENT", "PLATFORM_ADMIN"];
export const reviewerRoles: UserRole[] = ["COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"];
export const supplierWriteRoles: UserRole[] = ["SUPPLIER_ADMIN", "SUPPLIER_ESTIMATOR", "PLATFORM_ADMIN"];

export function hasAnyRole(user: CurrentUser, roles: UserRole[]) {
  return user.roles.some((role) => roles.includes(role));
}

export function requireAnyRole(user: CurrentUser, roles: UserRole[]) {
  if (!hasAnyRole(user, roles)) {
    throw new ApiError(403, `Requires one of: ${roles.join(", ")}.`);
  }
}

export function resolveTenantId(user: CurrentUser, requestedTenantId?: string) {
  if (hasAnyRole(user, ["PLATFORM_ADMIN"]) && requestedTenantId) {
    return requestedTenantId;
  }
  if (!user.tenantId) {
    throw new ApiError(403, "Authenticated user is missing a tenant id.");
  }
  if (requestedTenantId && requestedTenantId !== user.tenantId) {
    throw new ApiError(403, "Cross-tenant access denied.");
  }
  return user.tenantId;
}

export function createId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function compareTokenHash(token: string, expectedHash: string) {
  const actual = Buffer.from(hashInviteToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function runTenantMatching(input: {
  workPackage: WorkPackage;
  organizations: Organization[];
  facilities: Facility[];
  supplierProfiles: SupplierProfile[];
  capabilities: Capability[];
  complianceEvidence: ComplianceEvidence[];
  capacitySignals: CapacitySignal[];
  now?: Date;
}): SupplierMatch[] {
  return runMatching(input).matches;
}

export function evaluateDataRoomAccess(input: {
  invite: RFQInvite;
  workPackage: WorkPackage;
  documents: DocumentRecord[];
  evidence: ComplianceEvidence[];
  now?: Date;
}) {
  const now = input.now ?? new Date();

  if (input.invite.accessStatus !== "RELEASED") {
    return {
      allowed: false,
      reason: `Invite access is ${input.invite.accessStatus.toLowerCase()}.`,
      documents: [],
    };
  }

  if (new Date(input.invite.expiresAt).getTime() <= now.getTime()) {
    return {
      allowed: false,
      reason: "Invite has expired.",
      documents: [],
    };
  }

  if (input.invite.workPackageId !== input.workPackage.id) {
    return {
      allowed: false,
      reason: "Invite does not belong to this work package.",
      documents: [],
    };
  }

  if (
    controlledClassifications.includes(input.workPackage.dataClassification) &&
    requiredEvidenceMissingOrInvalid({
      workPackage: input.workPackage,
      evidence: input.evidence,
      supplierOrgId: input.invite.supplierOrgId,
      facilityId: input.invite.facilityId,
      now,
    }).length > 0
  ) {
    return {
      allowed: false,
      reason: "Access suspended because required evidence is not valid.",
      documents: [],
    };
  }

  return {
    allowed: true,
    reason: "Released RFQ invite is active and scoped to this work package.",
    documents: input.documents.filter((document) => document.workPackageId === input.workPackage.id),
  };
}

export function requiredEvidenceMissingOrInvalid(input: {
  workPackage: WorkPackage;
  evidence: ComplianceEvidence[];
  supplierOrgId: string;
  facilityId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return input.workPackage.requiredCompliance.flatMap((requiredType) => {
    const matching = input.evidence.filter(
      (evidence) =>
        evidence.supplierOrgId === input.supplierOrgId &&
        evidence.type === requiredType &&
        (!evidence.facilityId || !input.facilityId || evidence.facilityId === input.facilityId),
    );

    const valid = matching.some((evidence) => {
      const notExpired =
        !evidence.expirationDate || new Date(evidence.expirationDate).getTime() > now.getTime();
      return (evidence.status === "VALID" || evidence.status === "EXPIRES_SOON") && notExpired;
    });

    return valid ? [] : [`${requiredType} evidence is missing, expired, or not valid.`];
  });
}

export function buildAudit(input: {
  tenantId?: string;
  actorUserId?: string;
  orgId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadataJson?: Record<string, unknown>;
  ipAddress?: string;
  createdAt?: string;
}): AuditLog {
  return {
    id: createId("audit"),
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadataJson: {
      tenantId: input.tenantId,
      ...(input.metadataJson ?? {}),
    },
    ipAddress: input.ipAddress,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
