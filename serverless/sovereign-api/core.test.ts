import { describe, expect, it } from "vitest";
import { cloneDemoData } from "../../src/lib/seed";
import {
  compareTokenHash,
  createInviteToken,
  evaluateDataRoomAccess,
  evaluateEvidenceExpiration,
  hashInviteToken,
  requireAnyRole,
  resolveTenantId,
  runTenantMatching,
} from "./core";

describe("serverless pilot core", () => {
  it("enforces RBAC", () => {
    const user = {
      userId: "user-1",
      tenantId: "org-buyer",
      roles: ["BUYER_PROCUREMENT" as const],
    };

    expect(() => requireAnyRole(user, ["BUYER_PROCUREMENT"])).not.toThrow();
    expect(() => requireAnyRole(user, ["PLATFORM_ADMIN"])).toThrow("Requires one of");
  });

  it("prevents cross-tenant access except platform admin", () => {
    const buyer = {
      userId: "user-1",
      tenantId: "org-buyer",
      roles: ["BUYER_ADMIN" as const],
    };
    const platform = {
      userId: "user-2",
      roles: ["PLATFORM_ADMIN" as const],
    };

    expect(resolveTenantId(buyer)).toBe("org-buyer");
    expect(() => resolveTenantId(buyer, "other-tenant")).toThrow("Cross-tenant access denied");
    expect(resolveTenantId(platform, "other-tenant")).toBe("other-tenant");
  });

  it("runs deterministic matching server-side", () => {
    const data = cloneDemoData();
    const workPackage = data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket")!;
    const matches = runTenantMatching({
      workPackage,
      organizations: data.organizations,
      facilities: data.facilities,
      supplierProfiles: data.supplierProfiles,
      capabilities: data.capabilities,
      complianceEvidence: data.complianceEvidence,
      capacitySignals: data.capacitySignals,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(matches[0].eligibilityStatus).toBe("ELIGIBLE");
    expect(matches.some((match) => match.eligibilityStatus === "MANUAL_REVIEW")).toBe(true);
  });

  it("suspends data-room access when evidence expires", () => {
    const data = cloneDemoData();
    const invite = data.rfqInvites.find((candidate) => candidate.id === "invite-a-controlled")!;
    const workPackage = data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket")!;
    const allowed = evaluateDataRoomAccess({
      invite,
      workPackage,
      documents: data.documents,
      evidence: data.complianceEvidence,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });
    const denied = evaluateDataRoomAccess({
      invite: { ...invite, expiresAt: "2026-05-01T00:00:00.000Z" },
      workPackage,
      documents: data.documents,
      evidence: data.complianceEvidence,
      now: new Date("2026-05-22T12:00:00.000Z"),
    });

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain("expired");
  });

  it("hashes invite tokens without storing the raw token", () => {
    const token = createInviteToken();
    const hash = hashInviteToken(token);

    expect(hash).not.toContain(token);
    expect(compareTokenHash(token, hash)).toBe(true);
    expect(compareTokenHash(`${token}x`, hash)).toBe(false);
  });

  it("computes evidence expiration status changes", () => {
    const data = cloneDemoData();
    const validEvidence = data.complianceEvidence.find((item) => item.status === "VALID" && item.expirationDate)!;
    const expired = evaluateEvidenceExpiration(
      { ...validEvidence, expirationDate: "2026-05-01T00:00:00.000Z" },
      new Date("2026-05-22T12:00:00.000Z"),
    );
    const expiringSoon = evaluateEvidenceExpiration(
      { ...validEvidence, expirationDate: "2026-06-01T00:00:00.000Z" },
      new Date("2026-05-22T12:00:00.000Z"),
    );

    expect(expired?.status).toBe("EXPIRED");
    expect(expiringSoon?.status).toBe("EXPIRES_SOON");
  });
});
