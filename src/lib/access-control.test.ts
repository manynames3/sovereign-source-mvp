import { describe, expect, it } from "vitest";
import type { RFQInvite, User } from "./domain";
import { auditDocumentAccess, canAccessDocument } from "./access-control";
import { cloneDemoData } from "./seed";

const testNow = new Date("2026-05-22T12:00:00.000Z");

function fixtures() {
  const data = cloneDemoData();
  return {
    data,
    user: data.users.find((candidate) => candidate.id === "user-supplier-estimator") as User,
    invite: data.rfqInvites.find((candidate) => candidate.id === "invite-a-controlled") as RFQInvite,
    document: data.documents.find((candidate) => candidate.id === "doc-controlled-1")!,
    workPackage: data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket")!,
  };
}

describe("document access control", () => {
  it("allows released, unexpired, supplier-scoped RFQ invite access", () => {
    const { data, user, invite, document, workPackage } = fixtures();
    const decision = canAccessDocument({
      user,
      invite,
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.signedUrl).toContain(document.id);
    expect(decision.watermarkMetadata?.supplierOrgId).toBe(invite.supplierOrgId);
  });

  it("denies access before release", () => {
    const { data, user, invite, document, workPackage } = fixtures();
    const decision = canAccessDocument({
      user,
      invite: { ...invite, accessStatus: "NOT_RELEASED" },
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("not_released");
  });

  it("denies expired or revoked invite access", () => {
    const { data, user, invite, document, workPackage } = fixtures();

    const expired = canAccessDocument({
      user,
      invite: { ...invite, expiresAt: "2026-05-01T00:00:00.000Z" },
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });
    const revoked = canAccessDocument({
      user,
      invite: { ...invite, accessStatus: "REVOKED" },
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });

    expect(expired.allowed).toBe(false);
    expect(expired.reason).toContain("expired");
    expect(revoked.allowed).toBe(false);
    expect(revoked.reason).toContain("revoked");
  });

  it("denies access to users outside the invited supplier organization", () => {
    const { data, invite, document, workPackage } = fixtures();
    const buyerUser = data.users.find((candidate) => candidate.id === "user-procurement")!;
    const decision = canAccessDocument({
      user: buyerUser,
      invite,
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("not a member");
  });

  it("denies controlled document access when evidence expiration suspends access", () => {
    const { data, document, workPackage } = fixtures();
    const arcForgeUser: User = {
      id: "user-arcforge",
      organizationId: "sup-c",
      name: "ArcForge Estimator",
      email: "estimator@arcforge.example",
      role: "SUPPLIER_ESTIMATOR",
      createdAt: "2026-05-22T12:00:00.000Z",
    };
    const arcForgeInvite: RFQInvite = {
      id: "invite-c-controlled",
      rfqId: "rfq-controlled-1",
      workPackageId: workPackage.id,
      supplierOrgId: "sup-c",
      facilityId: "fac-c",
      accessStatus: "RELEASED",
      secureTokenHash: "demo",
      expiresAt: "2026-06-21T12:00:00.000Z",
      sentAt: "2026-05-22T12:00:00.000Z",
      responseStatus: "PENDING",
    };
    const decision = canAccessDocument({
      user: arcForgeUser,
      invite: arcForgeInvite,
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Access suspended");
  });

  it("creates audit logs for allowed and denied document events", () => {
    const { data, user, invite, document, workPackage } = fixtures();
    const decision = canAccessDocument({
      user,
      invite,
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: testNow,
    });
    const audit = auditDocumentAccess({ decision, user, document, invite });

    expect(audit.action).toBe("DOCUMENT_VIEWED");
    expect(audit.metadataJson.watermark).toBe("placeholder");
  });
});
