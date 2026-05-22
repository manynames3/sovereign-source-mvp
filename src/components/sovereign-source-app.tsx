"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ClipboardList,
  Eye,
  Factory,
  FileLock2,
  Filter,
  Flag,
  Gavel,
  History,
  LockKeyhole,
  PackagePlus,
  Search,
  Send,
  ShieldCheck,
  SquarePen,
  UserCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { canAccessDocument } from "@/lib/access-control";
import { createAuditLog, describeAuditAction } from "@/lib/audit";
import type {
  AuditLog,
  ComplianceEvidence,
  DataClassification,
  DemoData,
  EvidenceStatus,
  EvidenceType,
  MatchStatus,
  ProcessType,
  RFQInvite,
  SupplierMatch,
  WorkPackage,
} from "@/lib/domain";
import { evidenceLabels, processLabels, statusTone } from "@/lib/domain";
import { runMatching } from "@/lib/matching";
import { cloneDemoData } from "@/lib/seed";

const demoNow = new Date("2026-05-22T12:00:00.000Z");

type WorkspaceState = {
  data: DemoData;
  matches: SupplierMatch[];
};

type BuilderState = {
  title: string;
  classification: DataClassification;
  process: ProcessType;
  material: string;
  tolerance: string;
  quantity: string;
  compliance: EvidenceType[];
};

const defaultBuilder: BuilderState = {
  title: "New controlled prototype bracket",
  classification: "ITAR_TECHNICAL_DATA",
  process: "CNC_5_AXIS",
  material: "Titanium",
  tolerance: "0.0005",
  quantity: "25",
  compliance: ["AS9100", "ITAR_REGISTRATION_EVIDENCE", "JCP_DD2345"],
};

const complianceOptions: EvidenceType[] = [
  "AS9100",
  "ITAR_REGISTRATION_EVIDENCE",
  "JCP_DD2345",
  "CMMC_LEVEL_2",
  "NADCAP",
  "ISO_9001",
  "CUSTOMER_APPROVED",
];

const navItems: Array<{ label: string; href: string; Icon: LucideIcon }> = [
  { label: "Dashboard", href: "dashboard", Icon: ClipboardList },
  { label: "Suppliers", href: "suppliers", Icon: Factory },
  { label: "Evidence", href: "evidence", Icon: BadgeCheck },
  { label: "Work Packages", href: "work-packages", Icon: PackagePlus },
  { label: "Matching", href: "matching", Icon: Search },
  { label: "Dispatch", href: "dispatch", Icon: Send },
  { label: "Supplier Portal", href: "portal", Icon: UserCheck },
  { label: "Audit", href: "audit", Icon: History },
];

function createInitialWorkspace(): WorkspaceState {
  const data = cloneDemoData();
  const workPackage = data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket");
  return {
    data,
    matches: workPackage ? runMatchingForData(data, workPackage).matches : [],
  };
}

export function SovereignSourceApp() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(createInitialWorkspace);
  const [selectedWorkPackageId, setSelectedWorkPackageId] = useState("wp-controlled-bracket");
  const [activeSupplierId, setActiveSupplierId] = useState("sup-a");
  const [matchFilter, setMatchFilter] = useState<MatchStatus | "ALL">("ALL");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [auditFilter, setAuditFilter] = useState("");
  const [builder, setBuilder] = useState<BuilderState>(defaultBuilder);
  const [selectedInviteSuppliers, setSelectedInviteSuppliers] = useState<string[]>(["sup-a"]);
  const [accessDecision, setAccessDecision] = useState("Released data-room access ready.");

  const data = workspace.data;
  const selectedWorkPackage =
    data.workPackages.find((candidate) => candidate.id === selectedWorkPackageId) ?? data.workPackages[0];
  const buyerUser = data.users.find((candidate) => candidate.id === "user-procurement")!;
  const reviewerUser = data.users.find((candidate) => candidate.id === "user-reviewer")!;
  const supplierPortalUser = data.users.find((candidate) => candidate.id === "user-supplier-estimator")!;

  const suppliers = useMemo(
    () =>
      data.organizations.filter((org) => {
        if (org.type !== "SUPPLIER") {
          return false;
        }
        const haystack = `${org.name} ${org.cageCode ?? ""} ${org.state ?? ""}`.toLowerCase();
        return haystack.includes(supplierSearch.toLowerCase());
      }),
    [data.organizations, supplierSearch],
  );

  const activeSupplier = data.organizations.find((org) => org.id === activeSupplierId) ?? suppliers[0];
  const activeFacility = data.facilities.find((facility) => facility.supplierOrgId === activeSupplier?.id);
  const activeProfile = data.supplierProfiles.find((profile) => profile.supplierOrgId === activeSupplier?.id);
  const activeCapabilities = data.capabilities.filter(
    (capability) => capability.facilityId === activeFacility?.id,
  );
  const activeEvidence = data.complianceEvidence.filter(
    (evidence) => evidence.supplierOrgId === activeSupplier?.id,
  );
  const activeCapacity = data.capacitySignals.filter(
    (signal) => signal.supplierOrgId === activeSupplier?.id,
  );
  const activeMachines = data.machines.filter((machine) => machine.facilityId === activeFacility?.id);

  const matchCounts = useMemo(
    () => ({
      ELIGIBLE: workspace.matches.filter((match) => match.eligibilityStatus === "ELIGIBLE").length,
      MANUAL_REVIEW: workspace.matches.filter((match) => match.eligibilityStatus === "MANUAL_REVIEW").length,
      INELIGIBLE: workspace.matches.filter((match) => match.eligibilityStatus === "INELIGIBLE").length,
    }),
    [workspace.matches],
  );

  const filteredMatches = workspace.matches.filter((match) =>
    matchFilter === "ALL" ? true : match.eligibilityStatus === matchFilter,
  );

  const reviewQueue = data.complianceEvidence.filter(
    (evidence) => evidence.status !== "VALID" || evidence.expirationDate === "2025-01-15",
  );
  const expiringEvidence = data.complianceEvidence.filter(
    (evidence) => evidence.status === "EXPIRES_SOON" || evidence.status === "EXPIRED",
  );
  const auditLogs = data.auditLogs
    .filter((log) => {
      if (!auditFilter) {
        return true;
      }
      const orgName = organizationName(data, String(log.orgId ?? ""));
      return `${log.action} ${log.entityType} ${orgName}`.toLowerCase().includes(auditFilter.toLowerCase());
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const portalInvites = data.rfqInvites.filter(
    (invite) => invite.supplierOrgId === supplierPortalUser.organizationId,
  );

  function appendAudit(dataToUpdate: DemoData, log: AuditLog) {
    dataToUpdate.auditLogs = [log, ...dataToUpdate.auditLogs];
  }

  function runMatchForSelected() {
    setWorkspace((current) => {
      const workPackage = current.data.workPackages.find((candidate) => candidate.id === selectedWorkPackageId);
      if (!workPackage) {
        return current;
      }
      const result = runMatchingForData(current.data, workPackage);
      const dataCopy = structuredClone(current.data);
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: buyerUser,
          action: "MATCHING_RUN",
          entityType: "WorkPackage",
          entityId: workPackage.id,
          metadataJson: {
            eligible: result.counts.ELIGIBLE,
            manualReview: result.counts.MANUAL_REVIEW,
            ineligible: result.counts.INELIGIBLE,
          },
        }),
      );
      return { data: dataCopy, matches: result.matches };
    });
  }

  function approveClassification() {
    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      const workPackage = dataCopy.workPackages.find((candidate) => candidate.id === selectedWorkPackageId);
      if (!workPackage) {
        return current;
      }
      workPackage.status = "READY_TO_MATCH";
      workPackage.classificationApprovedBy = reviewerUser.id;
      workPackage.classificationApprovedAt = demoNow.toISOString();
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: reviewerUser,
          action: "CLASSIFICATION_APPROVED",
          entityType: "WorkPackage",
          entityId: workPackage.id,
          metadataJson: { classification: workPackage.dataClassification },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
  }

  function createWorkPackage() {
    const newWorkPackageId = `wp-created-${data.workPackages.length + 1}`;
    const newWorkPackage: WorkPackage = {
      id: newWorkPackageId,
      buyerOrgId: "org-buyer",
      title: builder.title,
      description: "Buyer-created work package from the MVP builder.",
      dataClassification: builder.classification,
      requiredCompliance: builder.compliance,
      requiredProcesses: [builder.process],
      requiredMaterials: [builder.material],
      requiredInspection: ["CMM"],
      toleranceRequiredInches: Number(builder.tolerance),
      quantity: Number(builder.quantity),
      dueDate: "2026-08-15",
      lifecycleStageTarget: "SCALING",
      status: "CLASSIFICATION_REVIEW",
    };

    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      dataCopy.workPackages = [newWorkPackage, ...dataCopy.workPackages];
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: buyerUser,
          action: "WORK_PACKAGE_CREATED",
          entityType: "WorkPackage",
          entityId: newWorkPackage.id,
          metadataJson: {
            classification: newWorkPackage.dataClassification,
            attachmentPolicy: "secure_data_room_only",
          },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
    setSelectedWorkPackageId(newWorkPackageId);
  }

  function reviewEvidence(evidenceId: string, status: EvidenceStatus) {
    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      const evidence = dataCopy.complianceEvidence.find((candidate) => candidate.id === evidenceId);
      if (!evidence) {
        return current;
      }
      evidence.status = status;
      evidence.reviewedBy = reviewerUser.id;
      evidence.reviewedAt = demoNow.toISOString();
      evidence.notes =
        status === "VALID"
          ? "Evidence valid after manual reviewer approval."
          : status === "EXPIRED"
            ? "Access suspended until renewed evidence is reviewed."
            : "Manual reviewer state updated.";
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: reviewerUser,
          action: "EVIDENCE_REVIEWED",
          entityType: "ComplianceEvidence",
          entityId: evidence.id,
          metadataJson: { status, supplierOrgId: evidence.supplierOrgId, scopeText: evidence.scopeText },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
  }

  function dispatchRFQ() {
    const eligibleSupplierIds = workspace.matches
      .filter((match) => match.eligibilityStatus === "ELIGIBLE")
      .map((match) => match.supplierOrgId);
    const supplierIds = selectedInviteSuppliers.filter((id) => eligibleSupplierIds.includes(id));
    if (!selectedWorkPackage || supplierIds.length === 0) {
      return;
    }

    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      const rfqId = `rfq-created-${current.data.rfqs.length + 1}`;
      dataCopy.rfqs = [
        {
          id: rfqId,
          workPackageId: selectedWorkPackage.id,
          buyerOrgId: selectedWorkPackage.buyerOrgId,
          status: "SENT",
          createdAt: demoNow.toISOString(),
          sentAt: demoNow.toISOString(),
        },
        ...dataCopy.rfqs,
      ];
      dataCopy.rfqInvites = [
        ...supplierIds.map<RFQInvite>((supplierId) => {
          const facility = dataCopy.facilities.find((candidate) => candidate.supplierOrgId === supplierId)!;
          return {
            id: `invite-${rfqId}-${supplierId}`,
            rfqId,
            workPackageId: selectedWorkPackage.id,
            supplierOrgId: supplierId,
            facilityId: facility.id,
            accessStatus: "RELEASED",
            secureTokenHash: `mock-${rfqId}-${supplierId}`,
            expiresAt: "2026-06-21T12:00:00.000Z",
            sentAt: demoNow.toISOString(),
            responseStatus: "PENDING",
          };
        }),
        ...dataCopy.rfqInvites,
      ];
      const workPackage = dataCopy.workPackages.find((candidate) => candidate.id === selectedWorkPackage.id);
      if (workPackage) {
        workPackage.status = "RFQ_SENT";
      }
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: buyerUser,
          action: "RFQ_DISPATCHED",
          entityType: "RFQ",
          entityId: rfqId,
          metadataJson: { supplierIds, attachmentPolicy: "no_attachments", accessStatus: "RELEASED" },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
  }

  function updateInviteResponse(inviteId: string, response: RFQInvite["responseStatus"]) {
    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      const invite = dataCopy.rfqInvites.find((candidate) => candidate.id === inviteId);
      if (!invite) {
        return current;
      }
      invite.responseStatus = response;
      if (response === "QUOTED") {
        invite.quoteAmount = 128500;
        invite.quotedLeadTimeDays = 42;
      }
      if (response === "NO_BID") {
        invite.noBidReason = "Capacity conflict";
      }
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: supplierPortalUser,
          action: "SUPPLIER_RESPONSE_LOGGED",
          entityType: "RFQInvite",
          entityId: invite.id,
          metadataJson: { response, quoteAmount: invite.quoteAmount, noBidReason: invite.noBidReason },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
  }

  function simulateDocumentAccess(invite: RFQInvite) {
    const document = data.documents.find((candidate) => candidate.workPackageId === invite.workPackageId);
    const workPackage = data.workPackages.find((candidate) => candidate.id === invite.workPackageId);
    if (!document || !workPackage) {
      return;
    }
    const decision = canAccessDocument({
      user: supplierPortalUser,
      invite,
      document,
      workPackage,
      evidence: data.complianceEvidence,
      now: demoNow,
    });
    setAccessDecision(decision.reason);
    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: supplierPortalUser,
          action: decision.allowed ? "DOCUMENT_VIEWED" : "DOCUMENT_ACCESS_DENIED",
          entityType: "Document",
          entityId: document.id,
          metadataJson: {
            inviteId: invite.id,
            reason: decision.reason,
            signedLink: decision.signedUrl ? "mock" : "none",
            watermark: decision.watermarkMetadata ? "placeholder" : "none",
          },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
  }

  function revokeInvite(inviteId: string) {
    setWorkspace((current) => {
      const dataCopy = structuredClone(current.data);
      const invite = dataCopy.rfqInvites.find((candidate) => candidate.id === inviteId);
      if (!invite) {
        return current;
      }
      invite.accessStatus = "REVOKED";
      appendAudit(
        dataCopy,
        createAuditLog({
          actor: buyerUser,
          action: "INVITE_REVOKED",
          entityType: "RFQInvite",
          entityId: invite.id,
          metadataJson: { supplierOrgId: invite.supplierOrgId, reason: "Buyer revoked data-room access" },
        }),
      );
      return { data: dataCopy, matches: current.matches };
    });
  }

  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#1b1f1c]">
      <header className="border-b border-[#d9ded4] bg-[#fbfcf8]">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-[#263f38] text-white">
              <ShieldCheck size={22} aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">Sovereign Source MVP</h1>
              <p className="text-sm text-[#5e665d]">
                Evidence-backed supplier qualification and secure RFQ routing.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge tone="good" label={`${matchCounts.ELIGIBLE} eligible`} />
            <StatusBadge tone="warn" label={`${matchCounts.MANUAL_REVIEW} manual review`} />
            <StatusBadge tone="bad" label={`${matchCounts.INELIGIBLE} ineligible`} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit rounded-lg border border-[#d9ded4] bg-white p-3">
          <nav className="grid gap-1 text-sm">
            {navItems.map(({ label, href, Icon }) => (
              <a
                key={String(href)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-[#38413b] hover:bg-[#eef2ea]"
                href={`#${href}`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="grid gap-5">
          <section id="dashboard" className="grid gap-4 lg:grid-cols-4">
            <MetricCard
              icon={<ClipboardList size={20} aria-hidden />}
              label="RFQs in Progress"
              value={String(data.rfqs.filter((rfq) => rfq.status !== "CLOSED").length)}
              detail={`${data.workPackages.filter((wp) => wp.status === "READY_TO_MATCH").length} ready to match`}
            />
            <MetricCard
              icon={<BadgeCheck size={20} aria-hidden />}
              label="Needs Review"
              value={String(reviewQueue.length)}
              detail="Evidence or manual states"
            />
            <MetricCard
              icon={<AlertTriangle size={20} aria-hidden />}
              label="Access Suspensions"
              value={String(expiringEvidence.length)}
              detail="Expired or expiring evidence"
            />
            <MetricCard
              icon={<History size={20} aria-hidden />}
              label="Audit Events"
              value={String(data.auditLogs.length)}
              detail="Sensitive actions logged"
            />
          </section>

          <section id="suppliers" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader
              icon={<Factory size={18} aria-hidden />}
              title="Supplier Directory"
              action={
                <label className="flex min-w-0 items-center gap-2 rounded-md border border-[#c8d0c2] px-3 py-2 text-sm">
                  <Search size={16} aria-hidden />
                  <input
                    className="w-44 bg-transparent outline-none"
                    placeholder="Search supplier"
                    value={supplierSearch}
                    onChange={(event) => setSupplierSearch(event.target.value)}
                  />
                </label>
              }
            />
            <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="grid gap-2">
                {suppliers.map((supplier) => (
                  <button
                    key={supplier.id}
                    className={`rounded-lg border p-3 text-left transition ${
                      supplier.id === activeSupplierId
                        ? "border-[#2d6a4f] bg-[#eef7f0]"
                        : "border-[#dfe5da] bg-[#fbfcf8] hover:border-[#9aa899]"
                    }`}
                    onClick={() => setActiveSupplierId(supplier.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{supplier.name}</p>
                        <p className="text-sm text-[#667064]">
                          {supplier.cageCode} · {supplier.state}
                        </p>
                      </div>
                      <StatusBadge
                        tone={profileTone(
                          data.supplierProfiles.find((profile) => profile.supplierOrgId === supplier.id)
                            ?.status ?? "NEEDS_REVIEW",
                        )}
                        label={
                          data.supplierProfiles
                            .find((profile) => profile.supplierOrgId === supplier.id)
                            ?.status.replace("_", " ")
                            .toLowerCase() ?? "needs review"
                        }
                      />
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-4">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{activeSupplier?.name}</h2>
                      <p className="text-sm text-[#667064]">{activeProfile?.summary}</p>
                    </div>
                    <StatusBadge
                      tone="neutral"
                      label={activeProfile?.lifecycleStage.replace("_", " ").toLowerCase() ?? "unknown"}
                    />
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <DetailBlock title="Facility">
                    <p className="font-medium">{activeFacility?.name}</p>
                    <p>{activeFacility?.address}</p>
                    <p>CAGE {activeFacility?.cageCode}</p>
                  </DetailBlock>
                  <DetailBlock title="Machines">
                    {activeMachines.map((machine) => (
                      <p key={machine.id}>
                        {machine.name} · {machine.envelope}
                      </p>
                    ))}
                  </DetailBlock>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[#687167]">
                      <tr className="border-b border-[#dfe5da]">
                        <th className="py-2 pr-4 font-medium">Process</th>
                        <th className="py-2 pr-4 font-medium">Materials</th>
                        <th className="py-2 pr-4 font-medium">Tolerance</th>
                        <th className="py-2 pr-4 font-medium">Inspection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCapabilities.map((capability) => (
                        <tr key={capability.id} className="border-b border-[#edf0ea]">
                          <td className="py-3 pr-4">{processLabels[capability.processType]}</td>
                          <td className="py-3 pr-4">{capability.materials.join(", ")}</td>
                          <td className="py-3 pr-4">+/-{capability.toleranceMinInches.toFixed(4)} in</td>
                          <td className="py-3 pr-4">{capability.inspectionCapabilities.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <DetailBlock title="Compliance Evidence">
                    {activeEvidence.map((evidence) => (
                      <EvidenceLine key={evidence.id} evidence={evidence} />
                    ))}
                  </DetailBlock>
                  <DetailBlock title="Capacity Confidence">
                    {activeCapacity.map((signal) => (
                      <p key={signal.id}>
                        {signal.signalType.replaceAll("_", " ").toLowerCase()}:{" "}
                        {Object.entries(signal.valueJson)
                          .map(([key, value]) => `${key} ${String(value)}`)
                          .join(", ")}
                      </p>
                    ))}
                  </DetailBlock>
                </div>
              </div>
            </div>
          </section>

          <section id="evidence" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader icon={<BadgeCheck size={18} aria-hidden />} title="Evidence Review Queue" />
            <div className="grid gap-3 p-4">
              {reviewQueue.map((evidence) => (
                <div
                  key={evidence.id}
                  className="grid gap-3 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{evidenceLabels[evidence.type]}</p>
                      <StatusBadge tone={evidenceTone(evidence.status)} label={evidence.status.replaceAll("_", " ").toLowerCase()} />
                      <span className="text-sm text-[#667064]">{organizationName(data, evidence.supplierOrgId)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#5d675c]">{evidence.scopeText}</p>
                    <p className="mt-1 text-xs text-[#7a8378]">
                      Source: {evidence.source.replaceAll("_", " ").toLowerCase()} · Expires{" "}
                      {evidence.expirationDate ?? "not specified"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <IconButton label="Approve" onClick={() => reviewEvidence(evidence.id, "VALID")}>
                      <Check size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="Reject" onClick={() => reviewEvidence(evidence.id, "REJECTED")}>
                      <X size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="Expire" onClick={() => reviewEvidence(evidence.id, "EXPIRED")}>
                      <AlertTriangle size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="Flag manual review" onClick={() => reviewEvidence(evidence.id, "MANUAL_REQUIRED")}>
                      <Flag size={16} aria-hidden />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="work-packages" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader icon={<PackagePlus size={18} aria-hidden />} title="Work Package Builder" />
            <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_440px]">
              <div className="grid gap-3">
                {data.workPackages.map((workPackage) => (
                  <button
                    key={workPackage.id}
                    className={`rounded-lg border p-3 text-left ${
                      selectedWorkPackageId === workPackage.id
                        ? "border-[#275d4a] bg-[#eef7f0]"
                        : "border-[#dfe5da] bg-[#fbfcf8]"
                    }`}
                    onClick={() => setSelectedWorkPackageId(workPackage.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{workPackage.title}</p>
                        <p className="text-sm text-[#667064]">{workPackage.description}</p>
                      </div>
                      <StatusBadge tone={workPackage.status === "READY_TO_MATCH" ? "good" : "warn"} label={workPackage.status.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4d574f]">
                      <span className="rounded-md bg-[#e9eef4] px-2 py-1">{workPackage.dataClassification}</span>
                      <span className="rounded-md bg-[#f4efe5] px-2 py-1">
                        {workPackage.requiredProcesses.map((process) => processLabels[process]).join(", ")}
                      </span>
                      <span className="rounded-md bg-[#ecf4e7] px-2 py-1">{workPackage.requiredMaterials.join(", ")}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Title</span>
                  <input
                    className="rounded-md border border-[#c8d0c2] bg-white px-3 py-2 outline-none"
                    value={builder.title}
                    onChange={(event) => setBuilder({ ...builder, title: event.target.value })}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Classification</span>
                    <select
                      className="rounded-md border border-[#c8d0c2] bg-white px-3 py-2 outline-none"
                      value={builder.classification}
                      onChange={(event) =>
                        setBuilder({ ...builder, classification: event.target.value as DataClassification })
                      }
                    >
                      {["PUBLIC", "FCI", "CUI", "ITAR_TECHNICAL_DATA", "EAR_CONTROLLED", "JCP_REQUIRED", "UNKNOWN"].map(
                        (classification) => (
                          <option key={classification}>{classification}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Process</span>
                    <select
                      className="rounded-md border border-[#c8d0c2] bg-white px-3 py-2 outline-none"
                      value={builder.process}
                      onChange={(event) => setBuilder({ ...builder, process: event.target.value as ProcessType })}
                    >
                      {Object.entries(processLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Material</span>
                    <select
                      className="rounded-md border border-[#c8d0c2] bg-white px-3 py-2 outline-none"
                      value={builder.material}
                      onChange={(event) => setBuilder({ ...builder, material: event.target.value })}
                    >
                      {["Titanium", "Inconel", "Aluminum", "Stainless", "Composites", "Plastics"].map((material) => (
                        <option key={material}>{material}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Tolerance</span>
                    <input
                      className="rounded-md border border-[#c8d0c2] bg-white px-3 py-2 outline-none"
                      inputMode="decimal"
                      value={builder.tolerance}
                      onChange={(event) => setBuilder({ ...builder, tolerance: event.target.value })}
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Quantity</span>
                  <input
                    className="rounded-md border border-[#c8d0c2] bg-white px-3 py-2 outline-none"
                    inputMode="numeric"
                    value={builder.quantity}
                    onChange={(event) => setBuilder({ ...builder, quantity: event.target.value })}
                  />
                </label>
                <div className="grid gap-2 text-sm">
                  <span className="font-medium">Required evidence</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {complianceOptions.map((option) => (
                      <label key={option} className="flex items-center gap-2">
                        <input
                          checked={builder.compliance.includes(option)}
                          onChange={(event) => {
                            const compliance = event.target.checked
                              ? [...builder.compliance, option]
                              : builder.compliance.filter((item) => item !== option);
                            setBuilder({ ...builder, compliance });
                          }}
                          type="checkbox"
                        />
                        {evidenceLabels[option]}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CommandButton label="Create Work Package" onClick={createWorkPackage}>
                    <PackagePlus size={16} aria-hidden />
                  </CommandButton>
                  <CommandButton label="Approve Classification" onClick={approveClassification}>
                    <Gavel size={16} aria-hidden />
                  </CommandButton>
                </div>
              </div>
            </div>
          </section>

          <section id="matching" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader
              icon={<Search size={18} aria-hidden />}
              title="Matching Results"
              action={
                <CommandButton label="Run Matching" onClick={runMatchForSelected}>
                  <Search size={16} aria-hidden />
                </CommandButton>
              }
            />
            <div className="grid gap-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {(["ALL", "ELIGIBLE", "MANUAL_REVIEW", "INELIGIBLE"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      matchFilter === filter
                        ? "border-[#263f38] bg-[#263f38] text-white"
                        : "border-[#c8d0c2] bg-[#fbfcf8] text-[#38413b]"
                    }`}
                    onClick={() => setMatchFilter(filter)}
                    type="button"
                  >
                    {filter.replaceAll("_", " ").toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="grid gap-3">
                {filteredMatches.map((match) => (
                  <div
                    key={match.id}
                    className="grid gap-3 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 lg:grid-cols-[minmax(0,1fr)_140px]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{organizationName(data, match.supplierOrgId)}</p>
                        <StatusBadge tone={statusTone[match.eligibilityStatus]} label={match.eligibilityStatus.replaceAll("_", " ").toLowerCase()} />
                        <span className="text-sm text-[#667064]">{facilityName(data, match.facilityId)}</span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <ReasonList title="Reasons" items={match.reasons} tone="good" />
                        <ReasonList title="Blockers" items={match.blockers} tone="bad" />
                      </div>
                      <ReasonList title="Capacity Confidence Signals" items={match.capacitySignals} tone="neutral" />
                    </div>
                    <div className="flex items-start justify-between gap-3 lg:block">
                      <div>
                        <p className="text-3xl font-semibold">{match.score}</p>
                        <p className="text-xs text-[#667064]">match score</p>
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-sm">
                        <input
                          checked={selectedInviteSuppliers.includes(match.supplierOrgId)}
                          disabled={match.eligibilityStatus !== "ELIGIBLE"}
                          onChange={(event) => {
                            setSelectedInviteSuppliers((current) =>
                              event.target.checked
                                ? [...new Set([...current, match.supplierOrgId])]
                                : current.filter((id) => id !== match.supplierOrgId),
                            );
                          }}
                          type="checkbox"
                        />
                        Select
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="dispatch" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader
              icon={<Send size={18} aria-hidden />}
              title="RFQ Dispatch"
              action={
                <CommandButton label="Release Invites" onClick={dispatchRFQ}>
                  <Send size={16} aria-hidden />
                </CommandButton>
              }
            />
            <div className="grid gap-3 p-4">
              {data.rfqInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-3 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{organizationName(data, invite.supplierOrgId)}</p>
                      <StatusBadge tone={invite.accessStatus === "RELEASED" ? "good" : "bad"} label={invite.accessStatus.replaceAll("_", " ").toLowerCase()} />
                      <StatusBadge tone="neutral" label={invite.responseStatus.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <p className="mt-1 text-sm text-[#667064]">
                      {workPackageName(data, invite.workPackageId)} · expires {formatDate(invite.expiresAt)}
                    </p>
                  </div>
                  <IconButton label="Revoke invite" onClick={() => revokeInvite(invite.id)}>
                    <LockKeyhole size={16} aria-hidden />
                  </IconButton>
                </div>
              ))}
            </div>
          </section>

          <section id="portal" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader icon={<UserCheck size={18} aria-hidden />} title="Supplier RFQ Portal" />
            <div className="grid gap-4 p-4">
              <div className="rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileLock2 className="mt-0.5 text-[#315c4a]" size={18} aria-hidden />
                  <p>{accessDecision}</p>
                </div>
              </div>
              {portalInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-3 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{workPackageName(data, invite.workPackageId)}</p>
                      <StatusBadge tone={invite.accessStatus === "RELEASED" ? "good" : "bad"} label={invite.accessStatus.replaceAll("_", " ").toLowerCase()} />
                      <StatusBadge tone="neutral" label={invite.responseStatus.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <p className="mt-1 text-sm text-[#667064]">
                      Data-room access expires {formatDate(invite.expiresAt)}. Blueprint files are not emailed.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <IconButton label="View data room" onClick={() => simulateDocumentAccess(invite)}>
                      <Eye size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="Quote" onClick={() => updateInviteResponse(invite.id, "QUOTED")}>
                      <SquarePen size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="No-bid" onClick={() => updateInviteResponse(invite.id, "NO_BID")}>
                      <X size={16} aria-hidden />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="audit" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader
              icon={<History size={18} aria-hidden />}
              title="Audit Log"
              action={
                <label className="flex min-w-0 items-center gap-2 rounded-md border border-[#c8d0c2] px-3 py-2 text-sm">
                  <Filter size={16} aria-hidden />
                  <input
                    className="w-44 bg-transparent outline-none"
                    placeholder="Filter audit"
                    value={auditFilter}
                    onChange={(event) => setAuditFilter(event.target.value)}
                  />
                </label>
              }
            />
            <div className="overflow-x-auto p-4">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[#687167]">
                  <tr className="border-b border-[#dfe5da]">
                    <th className="py-2 pr-4 font-medium">Time</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Entity</th>
                    <th className="py-2 pr-4 font-medium">Org</th>
                    <th className="py-2 pr-4 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-[#edf0ea]">
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className="py-3 pr-4">{describeAuditAction(log.action)}</td>
                      <td className="py-3 pr-4">
                        {log.entityType} · {log.entityId}
                      </td>
                      <td className="py-3 pr-4">{organizationName(data, String(log.orgId ?? ""))}</td>
                      <td className="max-w-[360px] py-3 pr-4 text-xs text-[#667064]">
                        {JSON.stringify(log.metadataJson)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function runMatchingForData(data: DemoData, workPackage: WorkPackage) {
  return runMatching({
    workPackage,
    organizations: data.organizations,
    facilities: data.facilities,
    supplierProfiles: data.supplierProfiles,
    capabilities: data.capabilities,
    complianceEvidence: data.complianceEvidence,
    capacitySignals: data.capacitySignals,
    now: demoNow,
  });
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#dfe5da] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-md bg-[#eef2ea] text-[#31453c]">{icon}</span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-[#d9ded4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#667064]">{label}</p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-md bg-[#eef2ea] text-[#31453c]">{icon}</span>
      </div>
      <p className="mt-3 text-sm text-[#667064]">{detail}</p>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 text-sm text-[#5d675c]">
      <p className="mb-2 font-medium text-[#1f261f]">{title}</p>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function EvidenceLine({ evidence }: { evidence: ComplianceEvidence }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{evidenceLabels[evidence.type]}</span>
      <StatusBadge tone={evidenceTone(evidence.status)} label={evidence.status.replaceAll("_", " ").toLowerCase()} />
    </div>
  );
}

function ReasonList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "bad" | "neutral";
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-[#667064]">
        <p className="font-medium text-[#1f261f]">{title}</p>
        <p>None</p>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <p className="font-medium text-[#1f261f]">{title}</p>
      <ul className="mt-1 grid gap-1">
        {items.map((item) => (
          <li key={item} className={tone === "bad" ? "text-[#8a2f25]" : tone === "good" ? "text-[#315c4a]" : "text-[#667064]"}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({
  tone,
  label,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  label: string;
}) {
  const toneClass = {
    good: "border-[#9bc2a6] bg-[#edf7ee] text-[#245a38]",
    warn: "border-[#dfc47a] bg-[#fff7dd] text-[#7a5a11]",
    bad: "border-[#e1aaa2] bg-[#fff0ed] text-[#8a2f25]",
    neutral: "border-[#c6d2dc] bg-[#edf3f8] text-[#31506a]",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="grid size-9 place-items-center rounded-md border border-[#c8d0c2] bg-white text-[#334139] hover:bg-[#eef2ea]"
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

function CommandButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md border border-[#263f38] bg-[#263f38] px-3 py-2 text-sm font-medium text-white hover:bg-[#34584d]"
      onClick={onClick}
      type="button"
    >
      {children}
      {label}
    </button>
  );
}

function evidenceTone(status: ComplianceEvidence["status"]) {
  if (status === "VALID" || status === "EXPIRES_SOON") {
    return "good";
  }
  if (status === "PENDING_REVIEW" || status === "MANUAL_REQUIRED") {
    return "warn";
  }
  return "bad";
}

function profileTone(status: "ACTIVE" | "NEEDS_REVIEW" | "SUSPENDED") {
  if (status === "ACTIVE") {
    return "good";
  }
  if (status === "NEEDS_REVIEW") {
    return "warn";
  }
  return "bad";
}

function organizationName(data: DemoData, organizationId: string) {
  return data.organizations.find((org) => org.id === organizationId)?.name ?? organizationId;
}

function facilityName(data: DemoData, facilityId: string) {
  return data.facilities.find((facility) => facility.id === facilityId)?.name ?? facilityId;
}

function workPackageName(data: DemoData, workPackageId: string) {
  return data.workPackages.find((workPackage) => workPackage.id === workPackageId)?.title ?? workPackageId;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
