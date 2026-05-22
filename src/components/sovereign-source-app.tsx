"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  Factory,
  FileSpreadsheet,
  FileLock2,
  FileText,
  Filter,
  Flag,
  Gavel,
  History,
  LockKeyhole,
  PackagePlus,
  PlayCircle,
  RefreshCcw,
  Route,
  Search,
  Send,
  ShieldCheck,
  SquarePen,
  UploadCloud,
  Users,
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

type DemoRole = "BUYER" | "REVIEWER" | "SUPPLIER";

type IntakeMode = "DRAWING" | "PO";

type IntakeStage = "UPLOAD" | "REQUIREMENTS" | "MATCHING" | "RFQ";

type IntakeFile = {
  name: string;
  kind: IntakeMode;
  sizeLabel: string;
};

type SourceLineItem = {
  partNumber: string;
  description: string;
  process: ProcessType;
  material: string;
  quantity: number;
  tolerance: string;
  classification: DataClassification;
  status: "ready" | "manual review required" | "access suspended";
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

const sampleIntakeFiles: IntakeFile[] = [
  { name: "controlled_titanium_bracket.step", kind: "DRAWING", sizeLabel: "2.8 MB" },
  { name: "PO-7421-line-items.xlsx", kind: "PO", sizeLabel: "44 KB" },
];

const sourceLineItems: SourceLineItem[] = [
  {
    partNumber: "AAS-7421-001",
    description: "Controlled titanium aerospace bracket",
    process: "CNC_5_AXIS",
    material: "Titanium",
    quantity: 25,
    tolerance: "+/-0.0005 in",
    classification: "ITAR_TECHNICAL_DATA",
    status: "ready",
  },
  {
    partNumber: "AAS-7421-002",
    description: "CMM first article inspection report",
    process: "OTHER",
    material: "Documentation",
    quantity: 1,
    tolerance: "AS9102 FAIR",
    classification: "CUI",
    status: "manual review required",
  },
  {
    partNumber: "AAS-7421-003",
    description: "Black anodize and passivation requirement",
    process: "COATING",
    material: "Titanium",
    quantity: 25,
    tolerance: "per drawing note 14",
    classification: "ITAR_TECHNICAL_DATA",
    status: "access suspended",
  },
];

const intakeStages: Array<{ id: IntakeStage; title: string; detail: string }> = [
  {
    id: "UPLOAD",
    title: "Upload",
    detail: "Drawing, model, PO, or line-item workbook received.",
  },
  {
    id: "REQUIREMENTS",
    title: "Extract",
    detail: "Part lines, process, material, quantity, inspection, and control markers are normalized.",
  },
  {
    id: "MATCHING",
    title: "Qualify",
    detail: "Supplier evidence, capability, capacity, and classification gates are checked.",
  },
  {
    id: "RFQ",
    title: "Route",
    detail: "Only eligible suppliers receive secure data-room invites.",
  },
];

const requirementChips = [
  "5-axis CNC",
  "Titanium",
  "+/-0.0005 in",
  "AS9100",
  "ITAR evidence",
  "JCP DD2345",
  "CMMC Level 2",
  "CMM / FAIR",
];

const navItems: Array<{ label: string; href: string; Icon: LucideIcon }> = [
  { label: "Upload Request", href: "source-intake", Icon: UploadCloud },
  { label: "Dashboard", href: "dashboard", Icon: ClipboardList },
  { label: "Demo Guide", href: "demo-guide", Icon: PlayCircle },
  { label: "Suppliers", href: "suppliers", Icon: Factory },
  { label: "Evidence", href: "evidence", Icon: BadgeCheck },
  { label: "Work Packages", href: "work-packages", Icon: PackagePlus },
  { label: "Matching", href: "matching", Icon: Search },
  { label: "Dispatch", href: "dispatch", Icon: Send },
  { label: "Supplier Portal", href: "portal", Icon: UserCheck },
  { label: "Audit", href: "audit", Icon: History },
  { label: "Artifacts", href: "artifacts", Icon: FileText },
  { label: "Pilot Scope", href: "pilot-scope", Icon: ShieldCheck },
];

const demoRoles: Array<{ id: DemoRole; label: string; description: string }> = [
  {
    id: "BUYER",
    label: "Buyer",
    description: "Create the controlled bracket RFQ, run matching, and release eligible invites.",
  },
  {
    id: "REVIEWER",
    label: "Compliance Reviewer",
    description: "Approve classification, review evidence, and suspend access when evidence expires.",
  },
  {
    id: "SUPPLIER",
    label: "Supplier",
    description: "Open released RFQs, acknowledge data-room rules, and quote, decline, or no-bid.",
  },
];

const walkthroughSteps = [
  {
    title: "Open the controlled bracket package",
    role: "Buyer",
    target: "work-packages",
    detail: "The package is ITAR technical data, requires AS9100, ITAR evidence, JCP DD2345, CMMC Level 2, 5-axis titanium capability, and +/-0.0005 in tolerance.",
  },
  {
    title: "Approve the classification gate",
    role: "Compliance Reviewer",
    target: "work-packages",
    detail: "Matching and data release stay blocked unless the buyer-side classification approval is present.",
  },
  {
    title: "Run deterministic matching",
    role: "Buyer",
    target: "matching",
    detail: "Vector is eligible; Keystone needs manual review for CMMC; expired, missing, and capability-mismatch suppliers are blocked with reasons.",
  },
  {
    title: "Release a secure RFQ invite",
    role: "Buyer",
    target: "dispatch",
    detail: "The demo releases data-room access through expiring RFQ invites. Blueprint files are never represented as email attachments.",
  },
  {
    title: "Respond from the supplier portal",
    role: "Supplier",
    target: "portal",
    detail: "The supplier can view the permitted data-room list, then quote, decline, or no-bid with response metadata.",
  },
  {
    title: "Export the audit trail",
    role: "Buyer",
    target: "audit",
    detail: "The audit export answers who saw what, when, and why for evidence review, matching, dispatch, data-room access, response, and revocation.",
  },
];

const buyerArtifacts = [
  {
    title: "2-minute demo script",
    href: "/artifacts/2-minute-demo-script.md",
    detail: "Talk track for the controlled titanium bracket walkthrough.",
  },
  {
    title: "One-page product brief",
    href: "/artifacts/product-brief.md",
    detail: "Buyer-facing positioning, target users, and MVP value.",
  },
  {
    title: "Pilot proposal",
    href: "/artifacts/pilot-proposal.md",
    detail: "Supplier evidence graph plus controlled RFQ routing pilot scope.",
  },
  {
    title: "Sample ROI claim",
    href: "/artifacts/sample-roi-claim.md",
    detail: "Conservative ROI framing around fewer wasted RFQs and lower data-release risk.",
  },
];

const sellableArchitecture = [
  "Real auth and RBAC",
  "Persistent database with tenant isolation",
  "Server-side matching and document-access checks",
  "Object storage with signed URLs",
  "Server-side audit log",
  "Evidence files with expiration tracking",
  "Invite tokens that expire and revoke server-side",
  "Admin console for demo data, suppliers, reviewers, and buyer orgs",
];

const firstPilotScope = [
  "Supplier directory",
  "Evidence vault",
  "Work package builder",
  "Classification approval gate",
  "Deterministic match results",
  "Secure RFQ invite and data-room flow",
  "Supplier response and no-bid flow",
  "Exportable audit trail",
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
  const [activeRole, setActiveRole] = useState<DemoRole>("BUYER");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("DRAWING");
  const [intakeStage, setIntakeStage] = useState<IntakeStage>("UPLOAD");
  const [intakeFiles, setIntakeFiles] = useState<IntakeFile[]>(sampleIntakeFiles);
  const [selectedWorkPackageId, setSelectedWorkPackageId] = useState("wp-controlled-bracket");
  const [activeSupplierId, setActiveSupplierId] = useState("sup-a");
  const [matchFilter, setMatchFilter] = useState<MatchStatus | "ALL">("ALL");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [auditFilter, setAuditFilter] = useState("");
  const [builder, setBuilder] = useState<BuilderState>(defaultBuilder);
  const [selectedInviteSuppliers, setSelectedInviteSuppliers] = useState<string[]>(["sup-a"]);
  const [accessDecision, setAccessDecision] = useState("Released data-room access ready.");
  const [dataRoomInviteId, setDataRoomInviteId] = useState<string | undefined>();

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
  const activeStageIndex = intakeStages.findIndex((stage) => stage.id === intakeStage);
  const shortlistMatches = [...workspace.matches].sort((a, b) => b.score - a.score).slice(0, 3);
  const intakeFileSummary =
    intakeFiles.length > 0
      ? `${intakeFiles.length} file${intakeFiles.length === 1 ? "" : "s"} loaded`
      : "No files loaded";

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
  const dataRoomInvite = data.rfqInvites.find((invite) => invite.id === dataRoomInviteId);
  const dataRoomDocuments = dataRoomInvite
    ? data.documents.filter((document) => document.workPackageId === dataRoomInvite.workPackageId)
    : [];
  const activeRoleCopy = demoRoles.find((role) => role.id === activeRole)!;
  const auditExportRows = auditLogs.map((log) => ({
    when: formatDateTime(log.createdAt),
    who: userName(data, log.actorUserId) ?? organizationName(data, String(log.orgId ?? "")),
    what: `${describeAuditAction(log.action)} ${log.entityType} ${log.entityId}`,
    why: auditWhy(log),
  }));
  const auditExportText = [
    "Who saw what, when, and why",
    ...auditExportRows.map((row) => `${row.when} | ${row.who} | ${row.what} | ${row.why}`),
  ].join("\n");

  function appendAudit(dataToUpdate: DemoData, log: AuditLog) {
    dataToUpdate.auditLogs = [log, ...dataToUpdate.auditLogs];
  }

  function resetDemoData() {
    const initial = createInitialWorkspace();
    setWorkspace(initial);
    setActiveRole("BUYER");
    setIntakeMode("DRAWING");
    setIntakeStage("UPLOAD");
    setIntakeFiles(sampleIntakeFiles);
    setSelectedWorkPackageId("wp-controlled-bracket");
    setActiveSupplierId("sup-a");
    setMatchFilter("ALL");
    setSupplierSearch("");
    setAuditFilter("");
    setBuilder(defaultBuilder);
    setSelectedInviteSuppliers(["sup-a"]);
    setAccessDecision("Released data-room access ready.");
    setDataRoomInviteId(undefined);
  }

  function startControlledWalkthrough() {
    setActiveRole("BUYER");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setActiveSupplierId("sup-a");
    setMatchFilter("ALL");
    scrollToSection("demo-guide");
  }

  function jumpToDemoTarget(target: string, roleLabel: string) {
    const role = demoRoles.find((candidate) => candidate.label === roleLabel);
    if (role) {
      setActiveRole(role.id);
    }
    scrollToSection(target);
  }

  function handleIntakeUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    const loadedFiles = Array.from(files).map<IntakeFile>((file) => ({
      name: file.name,
      kind: inferIntakeKind(file.name),
      sizeLabel: formatBytes(file.size),
    }));
    setIntakeFiles(loadedFiles);
    setIntakeMode(loadedFiles.some((file) => file.kind === "PO") ? "PO" : "DRAWING");
    setIntakeStage("REQUIREMENTS");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setBuilder(defaultBuilder);
  }

  function loadSampleIntake() {
    setIntakeFiles(sampleIntakeFiles);
    setIntakeMode("PO");
    setIntakeStage("REQUIREMENTS");
    setActiveRole("BUYER");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setBuilder(defaultBuilder);
  }

  function findQualifiedVendorsFromIntake() {
    setActiveRole("BUYER");
    setIntakeStage("MATCHING");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setMatchFilter("ALL");
    setWorkspace((current) => {
      const workPackage = current.data.workPackages.find(
        (candidate) => candidate.id === "wp-controlled-bracket",
      );
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
            source: "intake_upload",
            uploadedFiles: intakeFiles.map((file) => file.name),
            eligible: result.counts.ELIGIBLE,
            manualReview: result.counts.MANUAL_REVIEW,
            ineligible: result.counts.INELIGIBLE,
          },
        }),
      );
      return { data: dataCopy, matches: result.matches };
    });
    scrollToSection("matching");
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

    setIntakeStage("RFQ");
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
      if (response === "DECLINED") {
        invite.noBidReason = undefined;
        invite.quoteAmount = undefined;
        invite.quotedLeadTimeDays = undefined;
      }
      if (response === "NO_BID") {
        invite.noBidReason = "Capacity conflict";
        invite.quoteAmount = undefined;
        invite.quotedLeadTimeDays = undefined;
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

  function openDataRoom(invite: RFQInvite) {
    setDataRoomInviteId(invite.id);
    setAccessDecision("Data-room opened. Select a document to test view/download audit logging.");
  }

  function simulateDocumentAccess(invite: RFQInvite, documentId: string, action: "DOCUMENT_VIEWED" | "DOCUMENT_DOWNLOADED") {
    const document = data.documents.find((candidate) => candidate.id === documentId);
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
          action: decision.allowed ? action : "DOCUMENT_ACCESS_DENIED",
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
                Logged in as Aegis Advanced Systems · Source controlled work packages.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CommandButton label="New Source Request" onClick={() => scrollToSection("source-intake")}>
              <UploadCloud size={16} aria-hidden />
            </CommandButton>
            <CommandButton label="Start Walkthrough" onClick={startControlledWalkthrough}>
              <PlayCircle size={16} aria-hidden />
            </CommandButton>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#c8d0c2] bg-white px-3 py-2 text-sm font-medium text-[#334139] hover:bg-[#eef2ea]"
              onClick={resetDemoData}
              type="button"
            >
              <RefreshCcw size={16} aria-hidden />
              Reset Demo
            </button>
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
          <section className="rounded-lg border border-[#dfc47a] bg-[#fff9e7] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold text-[#5d4308]">Demo data only</p>
                <p className="text-sm text-[#74581b]">
                  This public demo uses simulated suppliers, evidence, RFQs, files, and audit events. Do not upload or enter real controlled technical data.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="warn" label="manual review required when evidence cannot be verified" />
                <StatusBadge tone="bad" label="access suspended when evidence expires" />
              </div>
            </div>
          </section>

          <section id="source-intake" className="rounded-lg border border-[#d9ded4] bg-white">
            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="grid gap-5 p-4 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="neutral" label="buyer workspace" />
                      <StatusBadge tone="warn" label="manual review required for controlled data" />
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
                      Upload a drawing or PO to find qualified vendors
                    </h2>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5e665d]">
                      Start with a CAD package, PDF drawing, or purchase order line list. The demo normalizes
                      requirements, applies evidence gates, and shows which suppliers are eligible, need manual
                      review, or have access suspended.
                    </p>
                  </div>
                  <div className="grid gap-2 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3">
                    <p className="text-sm font-medium">Current intake</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <p className="text-2xl font-semibold">{intakeFiles.length}</p>
                        <p className="text-xs text-[#667064]">files</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{sourceLineItems.length}</p>
                        <p className="text-xs text-[#667064]">line items</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold">{matchCounts.ELIGIBLE}</p>
                        <p className="text-xs text-[#667064]">eligible</p>
                      </div>
                    </div>
                    <p className="text-xs text-[#667064]">{intakeFileSummary}</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                  <div className="rounded-lg border border-[#cbd6ca] bg-[#f8faf5] p-4">
                    <div className="flex gap-2">
                      {(["DRAWING", "PO"] as const).map((mode) => (
                        <button
                          key={mode}
                          className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                            intakeMode === mode
                              ? "border-[#263f38] bg-[#263f38] text-white"
                              : "border-[#c8d0c2] bg-white text-[#38413b]"
                          }`}
                          onClick={() => setIntakeMode(mode)}
                          type="button"
                        >
                          {mode === "DRAWING" ? "Drawing" : "PO / BOM"}
                        </button>
                      ))}
                    </div>
                    <label className="mt-4 grid min-h-52 cursor-pointer place-items-center rounded-lg border border-dashed border-[#92a28f] bg-white p-5 text-center hover:bg-[#f1f5ee]">
                      <input
                        className="sr-only"
                        multiple
                        onChange={(event) => handleIntakeUpload(event.target.files)}
                        type="file"
                      />
                      <span className="grid gap-3">
                        <span className="mx-auto grid size-12 place-items-center rounded-lg bg-[#263f38] text-white">
                          <UploadCloud size={24} aria-hidden />
                        </span>
                        <span>
                          <span className="block font-medium">Upload drawing, model, PO, or line list</span>
                          <span className="mt-1 block text-sm text-[#667064]">
                            STEP, PDF, XLSX, CSV, and ZIP are represented in this demo.
                          </span>
                        </span>
                      </span>
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-[#c8d0c2] bg-white px-3 py-2 text-sm font-medium text-[#334139] hover:bg-[#eef2ea]"
                        onClick={loadSampleIntake}
                        type="button"
                      >
                        <FileSpreadsheet size={16} aria-hidden />
                        Use Sample PO
                      </button>
                      <CommandButton label="Find Qualified Vendors" onClick={findQualifiedVendorsFromIntake}>
                        <Search size={16} aria-hidden />
                      </CommandButton>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <DetailBlock title="Uploaded Package">
                      {intakeFiles.map((file) => (
                        <div key={file.name} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2">
                            {file.kind === "DRAWING" ? (
                              <FileLock2 size={15} aria-hidden />
                            ) : (
                              <FileSpreadsheet size={15} aria-hidden />
                            )}
                            {file.name}
                          </span>
                          <span className="text-xs text-[#667064]">{file.sizeLabel}</span>
                        </div>
                      ))}
                    </DetailBlock>
                    <DetailBlock title="Detected Requirements">
                      <div className="flex flex-wrap gap-2">
                        {requirementChips.map((item) => (
                          <span key={item} className="rounded-md border border-[#c8d0c2] bg-white px-2 py-1 text-xs">
                            {item}
                          </span>
                        ))}
                      </div>
                    </DetailBlock>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-[#dfe5da]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#fbfcf8] text-[#687167]">
                      <tr className="border-b border-[#dfe5da]">
                        <th className="py-2 pr-4 pl-3 font-medium">Line</th>
                        <th className="py-2 pr-4 font-medium">Process</th>
                        <th className="py-2 pr-4 font-medium">Material</th>
                        <th className="py-2 pr-4 font-medium">Qty</th>
                        <th className="py-2 pr-4 font-medium">Control</th>
                        <th className="py-2 pr-3 font-medium">Gate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceLineItems.map((item) => (
                        <tr key={item.partNumber} className="border-b border-[#edf0ea] last:border-0">
                          <td className="py-3 pr-4 pl-3">
                            <p className="font-medium">{item.partNumber}</p>
                            <p className="text-xs text-[#667064]">{item.description}</p>
                          </td>
                          <td className="py-3 pr-4">{processLabels[item.process]}</td>
                          <td className="py-3 pr-4">{item.material}</td>
                          <td className="py-3 pr-4">{item.quantity}</td>
                          <td className="py-3 pr-4">{item.classification.replaceAll("_", " ").toLowerCase()}</td>
                          <td className="py-3 pr-3">
                            <StatusBadge tone={lineItemTone(item.status)} label={item.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-[#dfe5da] bg-[#fbfcf8] p-4 xl:border-t-0 xl:border-l">
                <div className="grid gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Route size={18} aria-hidden />
                      <h2 className="font-semibold">Qualification Pipeline</h2>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {intakeStages.map((stage, index) => {
                        const isActive = index === activeStageIndex;
                        const isComplete = index < activeStageIndex;
                        return (
                          <div
                            key={stage.id}
                            className={`rounded-lg border p-3 ${
                              isActive
                                ? "border-[#263f38] bg-white"
                                : isComplete
                                  ? "border-[#9bc2a6] bg-[#edf7ee]"
                                  : "border-[#dfe5da] bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isComplete ? (
                                <CheckCircle2 size={16} className="text-[#245a38]" aria-hidden />
                              ) : (
                                <span className="grid size-4 place-items-center rounded-full border border-[#8b9889] text-[10px]">
                                  {index + 1}
                                </span>
                              )}
                              <p className="font-medium">{stage.title}</p>
                            </div>
                            <p className="mt-1 text-sm text-[#667064]">{stage.detail}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <DetailBlock title="Vendor Shortlist">
                    {shortlistMatches.map((match) => (
                      <div key={match.id} className="grid gap-1 border-b border-[#e4e9e1] pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#1f261f]">{organizationName(data, match.supplierOrgId)}</span>
                          <StatusBadge
                            tone={statusTone[match.eligibilityStatus]}
                            label={match.eligibilityStatus.replaceAll("_", " ").toLowerCase()}
                          />
                        </div>
                        <p className="text-xs text-[#667064]">
                          {match.score} score · {facilityName(data, match.facilityId)}
                        </p>
                      </div>
                    ))}
                  </DetailBlock>

                  <DetailBlock title="Next Action">
                    <p>Evidence valid suppliers can receive a secure RFQ invite.</p>
                    <p>Manual review required suppliers stay out of automatic routing.</p>
                    <p>Access suspended suppliers cannot receive controlled files.</p>
                  </DetailBlock>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-[#d9ded4] bg-white p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={18} aria-hidden />
                  <h2 className="font-semibold">Role Switcher</h2>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {demoRoles.map((role) => (
                    <button
                      key={role.id}
                      className={`rounded-lg border p-3 text-left ${
                        activeRole === role.id
                          ? "border-[#263f38] bg-[#eef7f0]"
                          : "border-[#dfe5da] bg-[#fbfcf8]"
                      }`}
                      onClick={() => setActiveRole(role.id)}
                      type="button"
                    >
                      <p className="font-medium">{role.label}</p>
                      <p className="mt-1 text-sm text-[#667064]">{role.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3">
                <p className="text-sm text-[#667064]">Active demo role</p>
                <p className="mt-1 text-lg font-semibold">{activeRoleCopy.label}</p>
                <p className="mt-2 text-sm text-[#5d675c]">{activeRoleCopy.description}</p>
              </div>
            </div>
          </section>

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

          <section id="demo-guide" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader
              icon={<PlayCircle size={18} aria-hidden />}
              title="Controlled Titanium Bracket Walkthrough"
              action={
                <CommandButton label="Start Walkthrough" onClick={startControlledWalkthrough}>
                  <PlayCircle size={16} aria-hidden />
                </CommandButton>
              }
            />
            <div className="grid gap-3 p-4 lg:grid-cols-3">
              {walkthroughSteps.map((step, index) => (
                <button
                  key={step.title}
                  className="rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 text-left hover:border-[#9aa899]"
                  onClick={() => jumpToDemoTarget(step.target, step.role)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid size-8 place-items-center rounded-md bg-[#263f38] text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <StatusBadge tone="neutral" label={step.role.toLowerCase()} />
                  </div>
                  <p className="mt-3 font-medium">{step.title}</p>
                  <p className="mt-2 text-sm text-[#667064]">{step.detail}</p>
                </button>
              ))}
            </div>
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
                    <div className="mt-2 grid gap-1 text-xs">
                      <p className={evidence.status === "EXPIRED" ? "text-[#8a2f25]" : "text-[#667064]"}>
                        {evidenceWarning(evidence)}
                      </p>
                      {evidence.notes ? <p className="text-[#667064]">Reviewer note: {evidence.notes}</p> : null}
                    </div>
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
                    <p className="mt-1 text-xs text-[#667064]">{inviteResponseDetail(invite)}</p>
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
                    <p className="mt-1 text-xs text-[#667064]">{inviteResponseDetail(invite)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <IconButton label="View data room" onClick={() => openDataRoom(invite)}>
                      <Eye size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="Quote" onClick={() => updateInviteResponse(invite.id, "QUOTED")}>
                      <SquarePen size={16} aria-hidden />
                    </IconButton>
                    <IconButton label="Decline" onClick={() => updateInviteResponse(invite.id, "DECLINED")}>
                      <Flag size={16} aria-hidden />
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
            <div className="grid gap-3 border-b border-[#dfe5da] p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div>
                <p className="font-medium">Audit Export</p>
                <p className="mt-1 text-sm text-[#667064]">
                  This view is formatted for a buyer review: who saw what, when, and why.
                </p>
              </div>
              <a
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#263f38] bg-[#263f38] px-3 py-2 text-sm font-medium text-white hover:bg-[#34584d]"
                download="sovereign-source-audit-export.txt"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(auditExportText)}`}
              >
                <Download size={16} aria-hidden />
                Download Audit Export
              </a>
              <pre className="max-h-48 overflow-auto rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 text-xs text-[#38413b] lg:col-span-2">
                {auditExportText}
              </pre>
            </div>
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

          <section id="artifacts" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader icon={<FileText size={18} aria-hidden />} title="Buyer-Facing Artifacts" />
            <div className="grid gap-3 p-4 lg:grid-cols-4">
              {buyerArtifacts.map((artifact) => (
                <a
                  key={artifact.href}
                  className="rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 hover:border-[#9aa899]"
                  href={artifact.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{artifact.title}</p>
                    <ExternalLink size={16} aria-hidden />
                  </div>
                  <p className="mt-2 text-sm text-[#667064]">{artifact.detail}</p>
                </a>
              ))}
            </div>
          </section>

          <section id="pilot-scope" className="rounded-lg border border-[#d9ded4] bg-white">
            <SectionHeader icon={<ShieldCheck size={18} aria-hidden />} title="Sellable Pilot Scope" />
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <DetailBlock title="Minimum Sellable Architecture">
                {sellableArchitecture.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </DetailBlock>
              <DetailBlock title="First Paid Pilot Product Scope">
                {firstPilotScope.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </DetailBlock>
            </div>
          </section>
        </div>
      </main>
      {dataRoomInvite ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#111814]/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-[#d9ded4] bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#dfe5da] p-4">
              <div>
                <p className="text-sm text-[#667064]">Secure data room</p>
                <h2 className="text-lg font-semibold">{workPackageName(data, dataRoomInvite.workPackageId)}</h2>
                <p className="mt-1 text-sm text-[#667064]">
                  Released to {organizationName(data, dataRoomInvite.supplierOrgId)} until {formatDate(dataRoomInvite.expiresAt)}.
                </p>
              </div>
              <IconButton label="Close data room" onClick={() => setDataRoomInviteId(undefined)}>
                <X size={16} aria-hidden />
              </IconButton>
            </div>
            <div className="grid gap-3 p-4">
              <div className="rounded-lg border border-[#dfc47a] bg-[#fff9e7] p-3 text-sm text-[#74581b]">
                Demo file list only. The sellable pilot must enforce these access checks server-side with object-storage signed URLs.
              </div>
              {dataRoomDocuments.map((document) => (
                <div
                  key={document.id}
                  className="grid gap-3 rounded-lg border border-[#dfe5da] bg-[#fbfcf8] p-3 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileLock2 size={16} aria-hidden />
                      <p className="font-medium">{document.filename}</p>
                      <StatusBadge tone="neutral" label={document.classification.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <p className="mt-1 text-xs text-[#667064]">
                      {formatBytes(document.sizeBytes)} · {document.checksum} · watermark metadata placeholder enabled
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconButton
                      label="View document"
                      onClick={() => simulateDocumentAccess(dataRoomInvite, document.id, "DOCUMENT_VIEWED")}
                    >
                      <Eye size={16} aria-hidden />
                    </IconButton>
                    <IconButton
                      label="Download document"
                      onClick={() => simulateDocumentAccess(dataRoomInvite, document.id, "DOCUMENT_DOWNLOADED")}
                    >
                      <Download size={16} aria-hidden />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
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

function scrollToSection(target: string) {
  document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function evidenceWarning(evidence: ComplianceEvidence) {
  if (evidence.status === "VALID") {
    return "Evidence valid for the listed scope and facility.";
  }
  if (evidence.status === "MANUAL_REQUIRED" || evidence.status === "PENDING_REVIEW") {
    return "Manual review required before this evidence can release controlled data.";
  }
  if (evidence.status === "EXPIRED") {
    return "Access suspended until renewed evidence is reviewed.";
  }
  if (evidence.status === "REJECTED") {
    return "Access suspended because this evidence was rejected.";
  }
  return "Evidence expires soon; review before releasing new controlled packages.";
}

function inviteResponseDetail(invite: RFQInvite) {
  if (invite.responseStatus === "QUOTED") {
    return `Quoted ${formatCurrency(invite.quoteAmount)} with ${invite.quotedLeadTimeDays ?? "unknown"} day lead time.`;
  }
  if (invite.responseStatus === "DECLINED") {
    return "Supplier declined this RFQ without receiving file attachments.";
  }
  if (invite.responseStatus === "NO_BID") {
    return `No-bid reason: ${invite.noBidReason ?? "not specified"}.`;
  }
  return "Awaiting supplier response.";
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

function lineItemTone(status: SourceLineItem["status"]) {
  if (status === "ready") {
    return "good";
  }
  if (status === "manual review required") {
    return "warn";
  }
  return "bad";
}

function inferIntakeKind(fileName: string): IntakeMode {
  const lowerName = fileName.toLowerCase();
  if (
    lowerName.includes("po") ||
    lowerName.includes("bom") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls")
  ) {
    return "PO";
  }
  return "DRAWING";
}

function organizationName(data: DemoData, organizationId: string) {
  return data.organizations.find((org) => org.id === organizationId)?.name ?? organizationId;
}

function userName(data: DemoData, userId?: string) {
  if (!userId) {
    return undefined;
  }
  return data.users.find((user) => user.id === userId)?.name ?? userId;
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

function formatCurrency(value?: number) {
  if (typeof value !== "number") {
    return "amount pending";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBytes(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} MB`;
  }
  return `${Math.round(value / 1_000)} KB`;
}

function auditWhy(log: AuditLog) {
  const metadata = log.metadataJson;
  if (typeof metadata.reason === "string") {
    return metadata.reason;
  }
  if (typeof metadata.status === "string") {
    return `Status changed to ${metadata.status}.`;
  }
  if (typeof metadata.attachmentPolicy === "string") {
    return `Attachment policy: ${metadata.attachmentPolicy}.`;
  }
  if (typeof metadata.classification === "string") {
    return `Classification gate: ${metadata.classification}.`;
  }
  if (typeof metadata.response === "string") {
    return `Supplier response: ${metadata.response}.`;
  }
  if (typeof metadata.copy === "string") {
    return metadata.copy;
  }
  return "Sensitive workflow event recorded for buyer review.";
}
