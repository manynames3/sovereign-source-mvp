import type {
  AuditLog,
  ComplianceEvidence,
  DocumentRecord,
  RFQInvite,
  User,
  WorkPackage,
} from "./domain";
import { controlledClassifications } from "./domain";

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  signedUrl?: string;
  watermarkMetadata?: Record<string, string>;
}

export function canAccessDocument(input: {
  user: User;
  invite?: RFQInvite;
  document: DocumentRecord;
  workPackage: WorkPackage;
  evidence: ComplianceEvidence[];
  now?: Date;
}): AccessDecision {
  const now = input.now ?? new Date();

  if (!input.invite) {
    return { allowed: false, reason: "No RFQ invite exists for this supplier." };
  }

  if (input.invite.workPackageId !== input.workPackage.id) {
    return { allowed: false, reason: "Invite does not belong to this work package." };
  }

  if (input.invite.accessStatus !== "RELEASED") {
    return { allowed: false, reason: `Invite access is ${input.invite.accessStatus.toLowerCase()}.` };
  }

  if (new Date(input.invite.expiresAt).getTime() <= now.getTime()) {
    return { allowed: false, reason: "Invite has expired." };
  }

  if (input.user.organizationId !== input.invite.supplierOrgId) {
    return { allowed: false, reason: "User is not a member of the invited supplier organization." };
  }

  if (
    controlledClassifications.includes(input.workPackage.dataClassification) &&
    hasSuspendedEvidence(input.evidence, input.invite.supplierOrgId, input.invite.facilityId)
  ) {
    return { allowed: false, reason: "Access suspended because required evidence is no longer valid." };
  }

  return {
    allowed: true,
    reason: "Released RFQ invite is active and scoped to this document.",
    signedUrl: `/api/mock-signed-link/${input.document.id}?expires=900`,
    watermarkMetadata: {
      user: input.user.email,
      supplierOrgId: input.invite.supplierOrgId,
      workPackageId: input.workPackage.id,
      documentId: input.document.id,
      generatedAt: now.toISOString(),
    },
  };
}

export function auditDocumentAccess(input: {
  decision: AccessDecision;
  user: User;
  document: DocumentRecord;
  invite?: RFQInvite;
}): AuditLog {
  return {
    id: `audit-document-${input.document.id}-${Date.now()}`,
    actorUserId: input.user.id,
    orgId: input.user.organizationId,
    action: input.decision.allowed ? "DOCUMENT_VIEWED" : "DOCUMENT_ACCESS_DENIED",
    entityType: "Document",
    entityId: input.document.id,
    metadataJson: {
      inviteId: input.invite?.id,
      reason: input.decision.reason,
      watermark: input.decision.watermarkMetadata ? "placeholder" : "none",
      signedLink: input.decision.signedUrl ? "mock" : "none",
    },
    createdAt: new Date().toISOString(),
  };
}

function hasSuspendedEvidence(
  evidence: ComplianceEvidence[],
  supplierOrgId: string,
  facilityId: string,
) {
  return evidence.some(
    (item) =>
      item.supplierOrgId === supplierOrgId &&
      (!item.facilityId || item.facilityId === facilityId) &&
      (item.status === "EXPIRED" || item.status === "REJECTED"),
  );
}
