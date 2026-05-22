import { describe, expect, it } from "vitest";
import type { WorkPackage } from "./domain";
import { runMatching, runMatchingForWorkPackage } from "./matching";
import { cloneDemoData } from "./seed";

const testNow = new Date("2026-05-22T12:00:00.000Z");

function withWorkPackage(workPackage: WorkPackage) {
  const data = cloneDemoData();
  return runMatching({
    workPackage,
    organizations: data.organizations,
    facilities: data.facilities,
    supplierProfiles: data.supplierProfiles,
    capabilities: data.capabilities,
    complianceEvidence: data.complianceEvidence,
    capacitySignals: data.capacitySignals,
    now: testNow,
  });
}

describe("matching engine", () => {
  it("marks Vector Aero as eligible for the controlled titanium bracket", () => {
    const data = cloneDemoData();
    const results = runMatchingForWorkPackage("wp-controlled-bracket", data, testNow);
    const vector = results.matches.find((match) => match.supplierOrgId === "sup-a");

    expect(vector?.eligibilityStatus).toBe("ELIGIBLE");
    expect(vector?.reasons.join(" ")).toContain("ITAR registration evidence evidence valid");
    expect(vector?.capacitySignals.length).toBeGreaterThan(0);
  });

  it("blocks a supplier when required evidence is expired", () => {
    const data = cloneDemoData();
    const heatTreatPackage: WorkPackage = {
      ...data.workPackages[0],
      id: "wp-heat-treat-nadcap",
      title: "Nadcap heat treat test",
      dataClassification: "PUBLIC",
      requiredCompliance: ["NADCAP"],
      requiredProcesses: ["HEAT_TREAT"],
      requiredMaterials: ["Titanium"],
      requiredInspection: ["NDT"],
      toleranceRequiredInches: 0.001,
    };

    const results = withWorkPackage(heatTreatPackage);
    const arcForge = results.matches.find((match) => match.supplierOrgId === "sup-c");

    expect(arcForge?.eligibilityStatus).toBe("INELIGIBLE");
    expect(arcForge?.blockers.join(" ")).toContain("expired");
  });

  it("blocks a supplier when required compliance evidence is missing", () => {
    const data = cloneDemoData();
    const packageRequiringAs9100: WorkPackage = {
      ...data.workPackages[1],
      id: "wp-basic-as9100",
      requiredCompliance: ["AS9100"],
    };

    const results = withWorkPackage(packageRequiringAs9100);
    const plainview = results.matches.find((match) => match.supplierOrgId === "sup-b");

    expect(plainview?.eligibilityStatus).toBe("INELIGIBLE");
    expect(plainview?.blockers.join(" ")).toContain("Missing compliance evidence");
  });

  it("blocks a supplier when tolerance capability is too loose", () => {
    const data = cloneDemoData();
    const tightFixture: WorkPackage = {
      ...data.workPackages[1],
      id: "wp-tight-fixture",
      toleranceRequiredInches: 0.0005,
    };

    const results = withWorkPackage(tightFixture);
    const plainview = results.matches.find((match) => match.supplierOrgId === "sup-b");

    expect(plainview?.eligibilityStatus).toBe("INELIGIBLE");
    expect(plainview?.blockers.join(" ")).toContain("Tolerance mismatch");
  });

  it("blocks a supplier when material capability does not match", () => {
    const data = cloneDemoData();
    const titaniumFixture: WorkPackage = {
      ...data.workPackages[1],
      id: "wp-titanium-fixture",
      requiredMaterials: ["Titanium"],
    };

    const results = withWorkPackage(titaniumFixture);
    const plainview = results.matches.find((match) => match.supplierOrgId === "sup-b");

    expect(plainview?.eligibilityStatus).toBe("INELIGIBLE");
    expect(plainview?.blockers.join(" ")).toContain("Material mismatch");
  });

  it("blocks all suppliers when classification is unknown or unapproved", () => {
    const data = cloneDemoData();
    const results = runMatchingForWorkPackage("wp-unapproved-draft", data, testNow);

    expect(results.counts.ELIGIBLE).toBe(0);
    expect(results.matches.every((match) => match.eligibilityStatus === "INELIGIBLE")).toBe(true);
    expect(results.matches[0]?.blockers.join(" ")).toContain("classification");
  });

  it("returns manual review when required evidence has a manual-review status", () => {
    const data = cloneDemoData();
    const results = runMatchingForWorkPackage("wp-controlled-bracket", data, testNow);
    const keystone = results.matches.find((match) => match.supplierOrgId === "sup-e");

    expect(keystone?.eligibilityStatus).toBe("MANUAL_REVIEW");
    expect(keystone?.reasons.join(" ")).toContain("CMMC Level 2 requires manual review");
  });
});
