"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  Factory,
  FileSpreadsheet,
  FileLock2,
  Filter,
  Flag,
  Gavel,
  History,
  LockKeyhole,
  PackagePlus,
  RefreshCcw,
  Route,
  Search,
  Send,
  ShieldCheck,
  SquarePen,
  UploadCloud,
  UserCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canAccessDocument } from "@/lib/access-control";
import { createAuditLog, describeAuditAction } from "@/lib/audit";
import {
  apiBaseUrl,
  apiRequest,
  clearStoredAuth,
  completeCognitoRedirect,
  type DashboardStateResponse,
  getStoredAuth,
  isAuthConfigured,
  startCognitoLogin,
  type StoredAuth,
} from "@/lib/auth-client";
import type {
  AuditLog,
  ComplianceEvidence,
  DataClassification,
  DemoData,
  EvidenceStatus,
  EvidenceType,
  MatchStatus,
  ProcessType,
  RFQ,
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

type IntakeStage = "UPLOAD" | "REQUIREMENTS" | "CURATION" | "MATCHING" | "REVIEW" | "RFQ";

type WorkspaceTab = "intake" | "suppliers" | "qualification" | "rfq" | "review" | "audit";

type IntakeFile = {
  name: string;
  kind: IntakeMode;
  sizeLabel: string;
};

type IntakePackageWarning = {
  title: string;
  detail: string;
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

type IntakePackageSummary = {
  title: string;
  classificationLabel: string;
  processLabel: string;
  quantityLabel: string;
};

type DemoIntakePackage = {
  id: string;
  buttonLabel: string;
  files: IntakeFile[];
  lineItems: SourceLineItem[];
  summary: IntakePackageSummary;
  builder: BuilderState;
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

const titaniumAerospaceFiles: IntakeFile[] = [
  { name: "ITAR_titanium_5-axis_bracket.step", kind: "DRAWING", sizeLabel: "2.8 MB" },
  { name: "titanium_bracket_drawing_revC.pdf", kind: "DRAWING", sizeLabel: "640 KB" },
  { name: "PO-7421-line-items.xlsx", kind: "PO", sizeLabel: "44 KB" },
  { name: "AS9102_FAIR_CMM_flowdown.pdf", kind: "DRAWING", sizeLabel: "220 KB" },
];

const titaniumAerospaceLineItems: SourceLineItem[] = [
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

const avionicsEnclosureFiles: IntakeFile[] = [
  { name: "CUI_aluminum_avionics_enclosure.step", kind: "DRAWING", sizeLabel: "4.1 MB" },
  { name: "avionics_enclosure_drawing_revB.pdf", kind: "DRAWING", sizeLabel: "780 KB" },
  { name: "PO-8310-avionics-enclosure.xlsx", kind: "PO", sizeLabel: "38 KB" },
  { name: "AS9102_first_article_and_CoC.pdf", kind: "DRAWING", sizeLabel: "260 KB" },
];

const avionicsEnclosureLineItems: SourceLineItem[] = [
  {
    partNumber: "AAS-8310-101",
    description: "Aluminum avionics enclosure chassis",
    process: "CNC_3_AXIS",
    material: "Aluminum 6061-T651",
    quantity: 12,
    tolerance: "+/-0.003 in",
    classification: "CUI",
    status: "ready",
  },
  {
    partNumber: "AAS-8310-102",
    description: "Conductive chem-film finish requirement",
    process: "COATING",
    material: "Aluminum",
    quantity: 12,
    tolerance: "MIL-DTL-5541 Type II",
    classification: "CUI",
    status: "manual review required",
  },
  {
    partNumber: "AAS-8310-103",
    description: "AS9102 FAIR, CoC, and lot traceability packet",
    process: "OTHER",
    material: "Documentation",
    quantity: 1,
    tolerance: "per quality clause Q-17",
    classification: "CUI",
    status: "manual review required",
  },
];

const demoIntakePackages: DemoIntakePackage[] = [
  {
    id: "titanium-bracket",
    buttonLabel: "Titanium bracket",
    files: titaniumAerospaceFiles,
    lineItems: titaniumAerospaceLineItems,
    summary: {
      title: "Controlled titanium aerospace bracket",
      classificationLabel: "itar technical data",
      processLabel: "CNC 5-axis",
      quantityLabel: "25 parts",
    },
    builder: defaultBuilder,
  },
  {
    id: "avionics-enclosure",
    buttonLabel: "Avionics enclosure",
    files: avionicsEnclosureFiles,
    lineItems: avionicsEnclosureLineItems,
    summary: {
      title: "CUI aluminum avionics enclosure",
      classificationLabel: "cui",
      processLabel: "CNC 3-axis + coating",
      quantityLabel: "12 assemblies",
    },
    builder: {
      title: "CUI aluminum avionics enclosure",
      classification: "CUI",
      process: "CNC_3_AXIS",
      material: "Aluminum 6061-T651",
      tolerance: "0.003",
      quantity: "12",
      compliance: ["AS9100", "CMMC_LEVEL_2"],
    },
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
    id: "CURATION",
    title: "Curate",
    detail: "Supplier onboarding, facility qualification, audit status, and quality documents are checked.",
  },
  {
    id: "MATCHING",
    title: "Match",
    detail: "Capability routing, lead-time signals, and supplier response history shape the shortlist.",
  },
  {
    id: "REVIEW",
    title: "Review",
    detail: "Complex jobs and controlled-data exceptions stay with a human reviewer.",
  },
  {
    id: "RFQ",
    title: "Route",
    detail: "Only eligible suppliers receive secure data-room invites.",
  },
];

const nativeCadExtensions = new Set([
  "asm",
  "catpart",
  "catproduct",
  "f3d",
  "iam",
  "ipt",
  "prt",
  "sldasm",
  "sldprt",
]);

const workspaceTabs: Array<{ id: WorkspaceTab; label: string; description: string; Icon: LucideIcon }> = [
  { id: "intake", label: "Intake", description: "Upload package", Icon: UploadCloud },
  { id: "suppliers", label: "Suppliers", description: "Directory", Icon: Factory },
  { id: "qualification", label: "Qualification", description: "Supplier fit", Icon: Search },
  { id: "rfq", label: "RFQ", description: "Invites and responses", Icon: Send },
  { id: "review", label: "Review", description: "Evidence gates", Icon: BadgeCheck },
  { id: "audit", label: "Audit", description: "Access trail", Icon: History },
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

function createInitialWorkspace(): WorkspaceState {
  return createWorkspaceFromData(cloneDemoData());
}

function createWorkspaceFromData(data: DemoData): WorkspaceState {
  const workPackage = data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket");
  return {
    data,
    matches: workPackage ? runMatchingForData(data, workPackage).matches : [],
  };
}

export function SovereignSourceApp() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(createInitialWorkspace);
  const [auth, setAuth] = useState<StoredAuth | undefined>();
  const [apiStatus, setApiStatus] = useState<"demo" | "loading" | "connected" | "error">(() =>
    apiBaseUrl() && isAuthConfigured() ? "loading" : "demo",
  );
  const [apiMessage, setApiMessage] = useState(() =>
    apiBaseUrl() && isAuthConfigured() ? "Checking Cognito session." : "Demo mode uses browser state only.",
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("intake");
  const [activeRole, setActiveRole] = useState<DemoRole>("BUYER");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("DRAWING");
  const [intakeStage, setIntakeStage] = useState<IntakeStage>("UPLOAD");
  const [intakeFiles, setIntakeFiles] = useState<IntakeFile[]>([]);
  const [hasUserProvidedIntakePackage, setHasUserProvidedIntakePackage] = useState(false);
  const [currentPackageSummary, setCurrentPackageSummary] = useState<IntakePackageSummary | undefined>();
  const [currentSourceLineItems, setCurrentSourceLineItems] = useState<SourceLineItem[]>([]);
  const [isIntakeDragActive, setIsIntakeDragActive] = useState(false);
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
  const detectedRequirementChips = useMemo(() => getDetectedRequirementChips(intakeFiles), [intakeFiles]);
  const intakePackageWarnings = useMemo(
    () => (hasUserProvidedIntakePackage ? getIntakePackageWarnings(intakeFiles) : []),
    [hasUserProvidedIntakePackage, intakeFiles],
  );
  const shouldShowIntakePackageReview = hasUserProvidedIntakePackage && intakeFiles.length > 0;
  const intakeReadinessItems = [
    {
      label: "Files",
      complete: intakeFiles.length > 0,
      detail: intakeFiles.length > 0 ? `${intakeFiles.length} attached` : "Waiting for upload",
    },
    {
      label: "Drawing",
      complete: intakeFiles.some((file) => isDrawingFile(file.name)),
      detail: intakeFiles.some((file) => isDrawingFile(file.name)) ? "Drawing present" : "PDF drawing preferred",
    },
    {
      label: "Line Items",
      complete: currentSourceLineItems.length > 0,
      detail: currentSourceLineItems.length > 0 ? `${currentSourceLineItems.length} parsed` : "PO/BOM optional",
    },
    {
      label: "Warnings",
      complete: hasUserProvidedIntakePackage && intakePackageWarnings.length === 0,
      detail:
        !hasUserProvidedIntakePackage
          ? "Waiting for package"
          : intakePackageWarnings.length === 0
          ? "No missing-package warnings"
          : `${intakePackageWarnings.length} review checks`,
    },
  ];
  const intakeReadinessPercent = Math.round(
    (intakeReadinessItems.filter((item) => item.complete).length / intakeReadinessItems.length) * 100,
  );
  const stageProgressPercent = hasUserProvidedIntakePackage
    ? Math.max(0, Math.round(((activeStageIndex + 1) / intakeStages.length) * 100))
    : 0;

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
  const backendAvailable = Boolean(auth && apiBaseUrl());

  const refreshPersistedWorkspace = useCallback(async (nextAuth: StoredAuth) => {
    setApiStatus("loading");
    setApiMessage("Loading persisted tenant data.");
    let state = await apiRequest<DashboardStateResponse>("/dashboard/state", {}, nextAuth);
    if (state.data.workPackages.length === 0) {
      await apiRequest("/admin/demo-seed", { method: "POST", body: JSON.stringify({}) }, nextAuth);
      state = await apiRequest<DashboardStateResponse>("/dashboard/state", {}, nextAuth);
    }
    setWorkspace(createWorkspaceFromData(state.data));
    setSelectedWorkPackageId(state.data.workPackages[0]?.id ?? "wp-controlled-bracket");
    setApiStatus("connected");
    setApiMessage(`Persisted tenant data loaded from ${state.tenant_id}.`);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeBackendSession() {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") === "demo" || !isAuthConfigured() || !apiBaseUrl()) {
        setApiStatus("demo");
        setApiMessage("Demo mode uses browser state only.");
        return;
      }

      setApiStatus("loading");
      setApiMessage("Checking Cognito session.");
      try {
        const nextAuth = (await completeCognitoRedirect()) ?? getStoredAuth();
        if (!nextAuth) {
          setApiStatus("error");
          setApiMessage("Sign in to load persisted pilot data.");
          return;
        }
        if (cancelled) {
          return;
        }
        setAuth(nextAuth);
        await refreshPersistedWorkspace(nextAuth);
      } catch (error) {
        if (!cancelled) {
          setApiStatus("error");
          setApiMessage(error instanceof Error ? error.message : "Unable to connect to pilot API.");
        }
      }
    }

    void initializeBackendSession();

    return () => {
      cancelled = true;
    };
  }, [refreshPersistedWorkspace]);

  function appendAudit(dataToUpdate: DemoData, log: AuditLog) {
    dataToUpdate.auditLogs = [log, ...dataToUpdate.auditLogs];
  }

  async function runPersistedAction(action: () => Promise<void>) {
    if (!auth || !apiBaseUrl()) {
      return false;
    }
    try {
      setApiStatus("loading");
      await action();
      await refreshPersistedWorkspace(auth);
      return true;
    } catch (error) {
      setApiStatus("error");
      setApiMessage(error instanceof Error ? error.message : "API action failed.");
      return false;
    }
  }

  function resetDemoData() {
    const initial = createInitialWorkspace();
    setWorkspace(initial);
    setActiveRole("BUYER");
    setIntakeMode("DRAWING");
    setIntakeStage("UPLOAD");
    setIntakeFiles([]);
    setHasUserProvidedIntakePackage(false);
    setCurrentPackageSummary(undefined);
    setCurrentSourceLineItems([]);
    setSelectedWorkPackageId("wp-controlled-bracket");
    setActiveSupplierId("sup-a");
    setMatchFilter("ALL");
    setSupplierSearch("");
    setAuditFilter("");
    setBuilder(defaultBuilder);
    setSelectedInviteSuppliers(["sup-a"]);
    setAccessDecision("Released data-room access ready.");
    setDataRoomInviteId(undefined);
    setActiveTab("intake");
  }

  function toggleInviteSupplier(supplierOrgId: string, checked: boolean) {
    setSelectedInviteSuppliers((current) =>
      checked ? [...new Set([...current, supplierOrgId])] : current.filter((id) => id !== supplierOrgId),
    );
  }

  async function handleIntakeUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    const loadedFiles = Array.from(files).map<IntakeFile>((file) => ({
      name: file.name,
      kind: inferIntakeKind(file.name),
      sizeLabel: formatBytes(file.size),
    }));
    const targetWorkPackage =
      data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket") ?? selectedWorkPackage;
    setIntakeFiles(loadedFiles);
    setHasUserProvidedIntakePackage(true);
    setCurrentPackageSummary(buildUploadedPackageSummary(loadedFiles));
    setCurrentSourceLineItems([]);
    setIntakeMode(loadedFiles.some((file) => file.kind === "PO") ? "PO" : "DRAWING");
    setIntakeStage("REQUIREMENTS");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setBuilder(defaultBuilder);

    if (auth && apiBaseUrl() && targetWorkPackage) {
      await runPersistedAction(async () => {
        for (const file of Array.from(files)) {
          const result = await apiRequest<{
            upload_url: string;
            document: { id: string };
          }>(
            `/work-packages/${targetWorkPackage.id}/documents/upload-url`,
            {
              method: "POST",
              body: JSON.stringify({
                filename: file.name,
                content_type: file.type || "application/octet-stream",
                size_bytes: file.size,
                classification: targetWorkPackage.dataClassification,
              }),
            },
            auth,
          );
          await fetch(result.upload_url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
        }
      });
    }
  }

  function handleIntakeDragEnter(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    setIsIntakeDragActive(true);
  }

  function handleIntakeDragOver(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsIntakeDragActive(true);
  }

  function handleIntakeDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const leftDropZone =
      event.clientX <= bounds.left ||
      event.clientX >= bounds.right ||
      event.clientY <= bounds.top ||
      event.clientY >= bounds.bottom;
    if (leftDropZone) {
      setIsIntakeDragActive(false);
    }
  }

  async function handleIntakeDrop(event: DragEvent<HTMLLabelElement>) {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    setIsIntakeDragActive(false);
    await handleIntakeUpload(event.dataTransfer.files);
  }

  function loadDemoIntake(packageId: string) {
    const demoPackage = demoIntakePackages.find((candidate) => candidate.id === packageId) ?? demoIntakePackages[0];
    setIntakeFiles(demoPackage.files);
    setHasUserProvidedIntakePackage(true);
    setCurrentPackageSummary(demoPackage.summary);
    setCurrentSourceLineItems(demoPackage.lineItems);
    setIntakeMode("PO");
    setIntakeStage("REQUIREMENTS");
    setActiveRole("BUYER");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setBuilder(demoPackage.builder);
  }

  function findQualifiedVendorsFromIntake() {
    if (!hasUserProvidedIntakePackage) {
      return;
    }
    setActiveRole("BUYER");
    setIntakeStage("REVIEW");
    setSelectedWorkPackageId("wp-controlled-bracket");
    setMatchFilter("ALL");
    const targetWorkPackage =
      data.workPackages.find((candidate) => candidate.id === "wp-controlled-bracket") ?? selectedWorkPackage;
    if (backendAvailable && targetWorkPackage) {
      void runPersistedAction(async () => {
        await apiRequest(
          `/work-packages/${targetWorkPackage.id}/match`,
          { method: "POST", body: JSON.stringify({}) },
          auth,
        );
      }).then((success) => {
        if (success) {
          setActiveTab("qualification");
        }
      });
      return;
    }
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
    setActiveTab("qualification");
  }

  function runMatchForSelected() {
    if (backendAvailable && selectedWorkPackage) {
      void runPersistedAction(async () => {
        await apiRequest(
          `/work-packages/${selectedWorkPackage.id}/match`,
          { method: "POST", body: JSON.stringify({}) },
          auth,
        );
      });
      return;
    }
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
    if (backendAvailable && selectedWorkPackage) {
      void runPersistedAction(async () => {
        await apiRequest(
          `/work-packages/${selectedWorkPackage.id}/classification`,
          {
            method: "PATCH",
            body: JSON.stringify({ data_classification: selectedWorkPackage.dataClassification }),
          },
          auth,
        );
      });
      return;
    }
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
    if (backendAvailable) {
      void runPersistedAction(async () => {
        await apiRequest(
          "/work-packages",
          {
            method: "POST",
            body: JSON.stringify({
              title: builder.title,
              description: "Buyer-created work package from the MVP builder.",
              data_classification: builder.classification,
              required_compliance: builder.compliance,
              required_processes: [builder.process],
              required_materials: [builder.material],
              required_inspection: ["CMM"],
              tolerance_required_inches: Number(builder.tolerance),
              quantity: Number(builder.quantity),
              due_date: "2026-08-15",
              lifecycle_stage_target: "SCALING",
            }),
          },
          auth,
        );
      });
      return;
    }
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
    if (backendAvailable) {
      void runPersistedAction(async () => {
        await apiRequest(
          `/evidence/${evidenceId}/review`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
          auth,
        );
      });
      return;
    }
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
    setActiveTab("rfq");
    if (backendAvailable) {
      void runPersistedAction(async () => {
        const created = await apiRequest<{ rfq: RFQ }>(
          "/rfqs",
          {
            method: "POST",
            body: JSON.stringify({ work_package_id: selectedWorkPackage.id }),
          },
          auth,
        );
        for (const supplierId of supplierIds) {
          const facilityId =
            workspace.matches.find((match) => match.supplierOrgId === supplierId)?.facilityId ??
            data.facilities.find((facility) => facility.supplierOrgId === supplierId)?.id;
          if (!facilityId) {
            continue;
          }
          await apiRequest(
            `/rfqs/${created.rfq.id}/invites`,
            {
              method: "POST",
              body: JSON.stringify({
                supplier_org_id: supplierId,
                facility_id: facilityId,
                expires_in_days: 14,
              }),
            },
            auth,
          );
        }
      });
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
    if (backendAvailable) {
      void runPersistedAction(async () => {
        await apiRequest(
          `/invites/${inviteId}/response`,
          {
            method: "PATCH",
            body: JSON.stringify({
              response_status: response,
              quote_amount: response === "QUOTED" ? 128500 : undefined,
              quoted_lead_time_days: response === "QUOTED" ? 42 : undefined,
              no_bid_reason: response === "NO_BID" ? "Capacity conflict" : undefined,
            }),
          },
          auth,
        );
      });
      return;
    }
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
    if (backendAvailable) {
      void runPersistedAction(async () => {
        await apiRequest(`/invites/${inviteId}/revoke`, { method: "PATCH", body: JSON.stringify({}) }, auth);
      });
      return;
    }
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

  const showAuthGate = Boolean(apiBaseUrl() && isAuthConfigured() && !auth && apiStatus !== "demo");

  if (showAuthGate) {
    return (
      <div className="grid min-h-screen bg-[#f7f8f4] px-4 py-8 text-[#1b1f1c]">
        <div className="mx-auto grid w-full max-w-xl content-center">
          <div className="rounded-lg border border-[#e5eaf2] bg-[#ffffff] p-6 shadow-sm">
            <div className="grid size-12 place-items-center rounded-lg bg-[#2563eb] text-white">
              <LockKeyhole size={22} aria-hidden />
            </div>
            <h1 className="mt-5 text-2xl font-semibold">Sign in to open the pilot workspace.</h1>
            <p className="mt-2 text-sm leading-6 text-[#5d675c]">
              The dashboard uses Cognito login, server-side tenant checks, and persisted RFQ data.
            </p>
            {apiStatus === "error" ? (
              <p className="mt-4 rounded-md border border-[#e1aaa2] bg-[#fff0ed] px-3 py-2 text-sm text-[#7c2f25]">
                {apiMessage}
              </p>
            ) : (
              <p className="mt-4 rounded-md border border-[#d9ded4] bg-[#f8fafc] px-3 py-2 text-sm text-[#5d675c]">
                {apiMessage}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#2563eb] bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
                onClick={() => void startCognitoLogin()}
                type="button"
              >
                <LockKeyhole size={16} aria-hidden />
                Sign in
              </button>
              <Link
                className="inline-flex items-center justify-center rounded-md border border-[#d8e0eb] bg-white px-4 py-2 text-sm font-semibold text-[#334155] hover:bg-[#eef2ea]"
                href="/"
              >
                Back to landing page
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#0f172a]">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-screen min-h-0 flex-col border-r border-[#e5eaf2] bg-[#ffffff] px-5 py-5 lg:flex">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#d8e0eb] bg-[#eff6ff] text-[#2563eb]">
              <ShieldCheck size={22} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">Sovereign Source</p>
              <p className="text-xs text-[#94a3b8]">Controlled sourcing</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-sm text-[#94a3b8]">
            <Search size={15} aria-hidden />
            <span>Search work packages</span>
          </div>

          <div className="mt-6 grid gap-1">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Main menu</p>
            {workspaceTabs.map(({ id, label, description, Icon }) => (
              <button
                key={id}
                className={`mt-1 grid gap-0.5 rounded-xl border px-3 py-2.5 text-left transition ${
                  activeTab === id
                    ? "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]"
                    : "border-transparent text-[#475569] hover:border-[#d8e0eb] hover:bg-[#f8fafc]"
                }`}
                onClick={() => setActiveTab(id)}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Icon size={16} aria-hidden />
                  {label}
                </span>
                <span className="pl-6 text-xs text-[#94a3b8]">{description}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-2 rounded-2xl border border-[#e5eaf2] bg-[#f8fafc] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Network status</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-2 py-2">
                <p className="text-lg font-semibold text-[#047857]">{matchCounts.ELIGIBLE}</p>
                    <p className="text-[11px] text-[#64748b]">eligible</p>
              </div>
              <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-2 py-2">
                <p className="text-lg font-semibold text-[#92400e]">{matchCounts.MANUAL_REVIEW}</p>
                <p className="text-[11px] text-[#64748b]">review</p>
              </div>
              <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-2">
                <p className="text-lg font-semibold text-[#b91c1c]">{matchCounts.INELIGIBLE}</p>
                <p className="text-[11px] text-[#64748b]">blocked</p>
              </div>
            </div>
          </div>

          <div className="mt-auto grid gap-2 border-t border-[#e5eaf2] pt-4">
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => setActiveTab("intake")}
              type="button"
            >
              <UploadCloud size={16} aria-hidden />
              New Source Request
            </button>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb]"
              onClick={resetDemoData}
              type="button"
            >
              <RefreshCcw size={16} aria-hidden />
              Reset Workspace
            </button>
            {isAuthConfigured() && apiBaseUrl() ? (
              auth ? (
                <button
                  className="inline-flex w-full items-center justify-center rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb]"
                  onClick={() => {
                    clearStoredAuth();
                    setAuth(undefined);
                    setApiStatus("demo");
                    setApiMessage("Signed out. Demo mode uses browser state only.");
                  }}
                  type="button"
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="inline-flex w-full items-center justify-center rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb]"
                  onClick={() => void startCognitoLogin()}
                  type="button"
                >
                  Sign in
                </button>
              )
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 hidden border-b border-[#e5eaf2] bg-white/90 px-8 py-4 backdrop-blur lg:flex lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium text-[#94a3b8]">Dashboards / Sourcing workspace</p>
              <h1 className="mt-1 text-xl font-semibold text-[#0f172a]">Controlled RFQ workspace</h1>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex w-72 items-center gap-2 rounded-xl border border-[#e5eaf2] bg-[#f8fafc] px-3 py-2 text-sm text-[#64748b]">
                <Search size={16} aria-hidden />
                <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search packages, suppliers" />
              </label>
              <div className="flex items-center gap-2">
                <StatusBadge tone="good" label={`${matchCounts.ELIGIBLE} eligible`} />
                <StatusBadge tone="warn" label={`${matchCounts.MANUAL_REVIEW} review`} />
                <StatusBadge tone="bad" label={`${matchCounts.INELIGIBLE} blocked`} />
              </div>
              <CommandButton label="New Source Request" onClick={() => setActiveTab("intake")}>
                <UploadCloud size={16} aria-hidden />
              </CommandButton>
            </div>
          </header>

          <header className="sticky top-0 z-30 border-b border-[#e5eaf2] bg-[#ffffff]/95 text-[#0f172a] backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#d8e0eb] bg-[#eff6ff] text-[#2563eb] sm:size-10">
              <ShieldCheck size={22} aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold sm:text-2xl">Sovereign Source</h1>
              <p className="text-xs text-[#64748b] sm:text-sm">
                {auth?.email
                  ? `${auth.email} · persisted sourcing workspace`
                  : "Aegis Advanced Systems · curated network plus sourcing software"}
              </p>
            </div>
          </div>
          <div className="grid w-full gap-2 text-sm lg:w-auto lg:justify-items-end">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              <CommandButton
                className="w-full sm:w-auto"
                label="New Source Request"
                onClick={() => setActiveTab("intake")}
              >
                <UploadCloud size={16} aria-hidden />
              </CommandButton>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb] sm:w-auto"
                onClick={resetDemoData}
                type="button"
              >
                <RefreshCcw size={16} aria-hidden />
                Reset Workspace
              </button>
              {isAuthConfigured() && apiBaseUrl() ? (
                auth ? (
                  <button
                    className="col-span-2 inline-flex w-full items-center justify-center rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb] sm:col-span-1 sm:w-auto"
                    onClick={() => {
                      clearStoredAuth();
                      setAuth(undefined);
                      setApiStatus("demo");
                      setApiMessage("Signed out. Demo mode uses browser state only.");
                    }}
                    type="button"
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    className="col-span-2 inline-flex w-full items-center justify-center rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] sm:col-span-1 sm:w-auto"
                    onClick={() => void startCognitoLogin()}
                    type="button"
                  >
                    Sign in
                  </button>
                )
              ) : null}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0">
              <StatusBadge tone="good" label={`${matchCounts.ELIGIBLE} eligible`} />
              <StatusBadge tone="warn" label={`${matchCounts.MANUAL_REVIEW} manual review`} />
              <StatusBadge tone="bad" label={`${matchCounts.INELIGIBLE} ineligible`} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1500px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        {currentPackageSummary ? (
          <section className="min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] p-3 text-[#0f172a] shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Current package</p>
                <h2 className="mt-2 text-lg font-semibold sm:text-xl">{currentPackageSummary.title}</h2>
                <p className="mt-1 text-sm text-[#64748b]">
                  {currentPackageSummary.classificationLabel} · {currentPackageSummary.processLabel} ·{" "}
                  {currentPackageSummary.quantityLabel}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:flex xl:flex-wrap xl:items-center xl:justify-end">
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                  {demoRoles.map((role) => (
                    <button
                      key={role.id}
                      className={`rounded-md border px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm ${
                        activeRole === role.id
                          ? "border-[#2563eb] bg-[#2563eb] text-white"
                          : "border-[#d8e0eb] bg-[#f8fafc] text-[#334155] hover:border-[#2563eb]"
                      }`}
                      onClick={() => setActiveRole(role.id)}
                      type="button"
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb]"
                    onClick={resetDemoData}
                    type="button"
                  >
                    <RefreshCcw size={16} aria-hidden />
                    Reset
                  </button>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"
                    download="sovereign-source-audit-export.txt"
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(auditExportText)}`}
                  >
                    <Download size={16} aria-hidden />
                    Export audit
                  </a>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <nav className="min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-2 lg:hidden">
          <div className="grid grid-cols-3 gap-1 sm:flex sm:min-w-max sm:gap-2">
            {workspaceTabs.map(({ id, label, description, Icon }) => (
              <button
                key={id}
                className={`grid min-w-0 gap-1 rounded-md border px-1 py-2 text-center sm:min-w-44 sm:px-3 sm:text-left ${
                  activeTab === id
                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                    : "border-[#e5eaf2] bg-[#f8fafc] text-[#334155] hover:border-[#2563eb]"
                }`}
                onClick={() => setActiveTab(id)}
                type="button"
              >
                <span className="grid justify-items-center gap-1 text-[11px] font-semibold sm:flex sm:items-center sm:justify-start sm:gap-2 sm:text-sm">
                  <Icon size={16} aria-hidden />
                  <span className="w-full truncate sm:hidden">{id === "qualification" ? "Qualify" : label}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
                <span className={activeTab === id ? "hidden text-xs text-[#dbeafe] sm:block" : "hidden text-xs text-[#64748b] sm:block"}>
                  {description}
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div className="grid min-w-0 gap-5">
          {hasUserProvidedIntakePackage ? (
            <section
              className={`min-w-0 rounded-lg border p-4 ${
                apiStatus === "connected"
                  ? "border-[#a7f3d0] bg-[#ecfdf5]"
                  : apiStatus === "error"
                    ? "border-[#fecaca] bg-[#fef2f2]"
                    : "border-[#fde68a] bg-[#fffbeb]"
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-[#0f172a]">
                    {apiStatus === "connected" ? "Persisted pilot data" : "Controlled data notice"}
                  </p>
                  <p className="text-sm text-[#64748b]">
                    {apiStatus === "connected"
                      ? apiMessage
                      : "Production uploads should go through approved storage, access gates, and audit logging before controlled RFQ release."}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section id="dashboard" className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
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

          <section
            id="source-intake"
            className={
              activeTab === "intake"
                ? "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]"
                : "hidden"
            }
          >
            <div className="grid min-w-0 gap-5">
              <section className="min-w-0 overflow-hidden rounded-lg border border-[#e5eaf2] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
                <div className="border-b border-[#e5eaf2] p-4 sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                        Source intake
                      </p>
                      <h2 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight sm:text-4xl">
                        Start a controlled RFQ package
                      </h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64748b]">
                        Attach the model, drawing, and PO/BOM package. Sovereign Source turns the package into
                        reviewable requirements before buyer release.
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[#334155]">Package readiness</p>
                        <p className="text-2xl font-semibold text-[#0f172a]">{intakeReadinessPercent}%</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                        <div
                          className="h-full rounded-full bg-[#2563eb]"
                          style={{ width: `${intakeReadinessPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[#64748b]">
                        {hasUserProvidedIntakePackage
                          ? `${intakePackageWarnings.length} package checks need review`
                          : "Upload or load a sample package to start."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(420px,1.1fr)_minmax(280px,0.9fr)] sm:p-5">
                  <div className="rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3">
                    <div className="grid grid-cols-2 gap-2">
                      {(["DRAWING", "PO"] as const).map((mode) => (
                        <button
                          key={mode}
                          className={`rounded-md border px-3 py-2 text-sm font-medium ${
                            intakeMode === mode
                              ? "border-[#2563eb] bg-[#2563eb] text-white"
                              : "border-[#d8e0eb] bg-white text-[#334155] hover:border-[#2563eb]"
                          }`}
                          onClick={() => setIntakeMode(mode)}
                          type="button"
                        >
                          {mode === "DRAWING" ? "Drawing / Model" : "PO / BOM"}
                        </button>
                      ))}
                    </div>
                    <label
                      className={`mt-3 grid min-h-72 cursor-pointer place-items-center rounded-lg border border-dashed p-5 text-center transition sm:min-h-96 sm:p-6 ${
                        isIntakeDragActive
                          ? "border-[#2563eb] bg-[#eff6ff] shadow-[inset_0_0_0_2px_rgba(37,99,235,0.16)]"
                          : "border-[#cbd5e1] bg-white hover:border-[#2563eb]"
                      }`}
                      onDragEnter={handleIntakeDragEnter}
                      onDragLeave={handleIntakeDragLeave}
                      onDragOver={handleIntakeDragOver}
                      onDrop={(event) => void handleIntakeDrop(event)}
                    >
                      <input
                        className="sr-only"
                        multiple
                        accept=".step,.stp,.pdf,.xlsx,.xls,.csv,.zip,.dxf,.dwg,.stl,.iges,.igs,.x_t,.x_b,.ipt,.iam,.sldprt,.sldasm,.prt,.asm,.catpart,.catproduct"
                        onChange={(event) => void handleIntakeUpload(event.target.files)}
                        type="file"
                      />
                      <span className="grid gap-3">
                        <span className="mx-auto grid size-16 place-items-center rounded-lg border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]">
                          <UploadCloud size={30} aria-hidden />
                        </span>
                        <span>
                          <span className="block text-lg font-semibold text-[#0f172a]">
                            {isIntakeDragActive ? "Drop files to attach them" : "Drop package files here"}
                          </span>
                          <span className="mx-auto mt-2 block max-w-sm text-sm text-[#64748b]">
                            STEP/STP plus PDF drawing gives the best requirement detection. Add XLSX/CSV for PO or BOM
                            line items.
                          </span>
                        </span>
                      </span>
                    </label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {demoIntakePackages.map((demoPackage) => (
                        <button
                          key={demoPackage.id}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#d8e0eb] bg-white px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb]"
                          onClick={() => loadDemoIntake(demoPackage.id)}
                          type="button"
                        >
                          <PackagePlus size={16} aria-hidden />
                          {demoPackage.buttonLabel}
                        </button>
                      ))}
                      <CommandButton
                        className="w-full"
                        disabled={!hasUserProvidedIntakePackage}
                        label={hasUserProvidedIntakePackage ? "Find Vendors" : "Attach Package First"}
                        onClick={findQualifiedVendorsFromIntake}
                      >
                        <Search size={16} aria-hidden />
                      </CommandButton>
                    </div>
                  </div>

                  <div className="grid content-start gap-4">
                    <div className="rounded-lg border border-[#e5eaf2] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#0f172a]">
                            {currentPackageSummary?.title ?? "No package attached"}
                          </p>
                          <p className="mt-1 text-sm text-[#64748b]">
                            {currentPackageSummary
                              ? `${currentPackageSummary.processLabel} · ${currentPackageSummary.quantityLabel}`
                              : "Upload files or load a sample package."}
                          </p>
                        </div>
                        <StatusBadge tone={hasUserProvidedIntakePackage ? "warn" : "neutral"} label={hasUserProvidedIntakePackage ? "review" : "empty"} />
                      </div>
                      <div className="mt-4 grid gap-2">
                        {intakeFiles.length > 0 ? (
                          intakeFiles.map((file) => (
                            <div
                              key={file.name}
                              className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[#e5eaf2] bg-[#f8fafc] px-3 py-2 text-sm"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                {file.kind === "DRAWING" ? (
                                  <FileLock2 className="shrink-0 text-[#2563eb]" size={15} aria-hidden />
                                ) : (
                                  <FileSpreadsheet className="shrink-0 text-[#2563eb]" size={15} aria-hidden />
                                )}
                                <span className="truncate">{file.name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[#64748b]">{file.sizeLabel}</span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed border-[#d8e0eb] bg-[#f8fafc] px-3 py-6 text-center text-sm text-[#64748b]">
                            Package files will appear here.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-[#e5eaf2] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[#0f172a]">Requirements</p>
                        <span className="text-xs text-[#64748b]">{detectedRequirementChips.length} signals</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {detectedRequirementChips.map((item) => (
                          <span
                            key={item}
                            className="rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-2 py-1 text-xs text-[#334155]"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-2">
                        {intakeReadinessItems.map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2">
                              {item.complete ? (
                                <CheckCircle2 className="text-[#047857]" size={15} aria-hidden />
                              ) : (
                                <AlertTriangle className="text-[#92400e]" size={15} aria-hidden />
                              )}
                              <span className="font-medium text-[#334155]">{item.label}</span>
                            </span>
                            <span className="text-xs text-[#64748b]">{item.detail}</span>
                          </div>
                        ))}
                      </div>
                      {shouldShowIntakePackageReview && intakePackageWarnings.length > 0 ? (
                        <div className="mt-4 grid gap-2">
                          {intakePackageWarnings.slice(0, 3).map((warning) => (
                            <div
                              key={warning.title}
                              className="rounded-md border border-[#fde68a] bg-[#fffbeb] p-2 text-xs text-[#92400e]"
                            >
                              <p className="font-medium text-[#78350f]">{warning.title}</p>
                              <p className="mt-0.5 leading-5">{warning.detail}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              {currentSourceLineItems.length > 0 ? (
                <section className="min-w-0 overflow-hidden rounded-lg border border-[#e5eaf2] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
                  <div className="flex flex-col gap-1 border-b border-[#e5eaf2] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-[#0f172a]">Line-item extraction</p>
                      <p className="text-sm text-[#64748b]">Parsed manufacturing and review gates from the package.</p>
                    </div>
                    <StatusBadge tone="warn" label="buyer review required" />
                  </div>
                  <div className="grid gap-3 p-3 sm:hidden">
                    {currentSourceLineItems.map((item) => (
                      <div key={item.partNumber} className="rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{item.partNumber}</p>
                            <p className="mt-1 text-sm text-[#64748b]">{item.description}</p>
                          </div>
                          <StatusBadge tone={lineItemTone(item.status)} label={item.status} />
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#64748b]">
                          <div>
                            <dt className="text-[#94a3b8]">Process</dt>
                            <dd className="font-medium text-[#0f172a]">{processLabels[item.process]}</dd>
                          </div>
                          <div>
                            <dt className="text-[#94a3b8]">Qty</dt>
                            <dd className="font-medium text-[#0f172a]">{item.quantity}</dd>
                          </div>
                          <div>
                            <dt className="text-[#94a3b8]">Material</dt>
                            <dd className="font-medium text-[#0f172a]">{item.material}</dd>
                          </div>
                          <div>
                            <dt className="text-[#94a3b8]">Control</dt>
                            <dd className="font-medium text-[#0f172a]">
                              {item.classification.replaceAll("_", " ").toLowerCase()}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="min-w-[760px] text-left text-sm">
                      <thead className="bg-[#f8fafc] text-[#64748b]">
                        <tr className="border-b border-[#e5eaf2]">
                          <th className="py-3 pr-4 pl-4 font-medium">Part</th>
                          <th className="py-3 pr-4 font-medium">Process</th>
                          <th className="py-3 pr-4 font-medium">Material</th>
                          <th className="py-3 pr-4 font-medium">Qty</th>
                          <th className="py-3 pr-4 font-medium">Control</th>
                          <th className="py-3 pr-4 font-medium">Gate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSourceLineItems.map((item) => (
                          <tr key={item.partNumber} className="border-b border-[#e5eaf2] last:border-0">
                            <td className="py-3 pr-4 pl-4">
                              <p className="font-medium">{item.partNumber}</p>
                              <p className="text-xs text-[#64748b]">{item.description}</p>
                            </td>
                            <td className="py-3 pr-4">{processLabels[item.process]}</td>
                            <td className="py-3 pr-4">{item.material}</td>
                            <td className="py-3 pr-4">{item.quantity}</td>
                            <td className="py-3 pr-4">{item.classification.replaceAll("_", " ").toLowerCase()}</td>
                            <td className="py-3 pr-4">
                              <StatusBadge tone={lineItemTone(item.status)} label={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <section className="min-w-0 overflow-hidden rounded-lg border border-[#e5eaf2] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
                <div className="flex flex-col gap-3 border-b border-[#e5eaf2] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-[#0f172a]">Qualified supplier shortlist</p>
                    <p className="text-sm text-[#64748b]">Ranked facility matches with access-state guardrails.</p>
                  </div>
                  <button
                    className="inline-flex items-center justify-center rounded-md border border-[#d8e0eb] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:border-[#2563eb]"
                    onClick={() => setActiveTab("qualification")}
                    type="button"
                  >
                    View matching
                  </button>
                </div>
                <div className="grid gap-3 p-3 md:hidden">
                  {shortlistMatches.map((match) => (
                    <div key={match.id} className="rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#0f172a]">{organizationName(data, match.supplierOrgId)}</p>
                          <p className="mt-1 text-xs text-[#64748b]">{facilityName(data, match.facilityId)}</p>
                        </div>
                        <StatusBadge
                          tone={statusTone[match.eligibilityStatus]}
                          label={match.eligibilityStatus.replaceAll("_", " ").toLowerCase()}
                        />
                      </div>
                      <p className="mt-3 text-sm text-[#64748b]">
                        {match.score} score · {leadTimeEstimate(match.supplierOrgId)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-[720px] text-left text-sm">
                    <thead className="bg-[#f8fafc] text-[#64748b]">
                      <tr className="border-b border-[#e5eaf2]">
                        <th className="py-3 pr-4 pl-4 font-medium">Supplier</th>
                        <th className="py-3 pr-4 font-medium">Facility</th>
                        <th className="py-3 pr-4 font-medium">Score</th>
                        <th className="py-3 pr-4 font-medium">Lead Time</th>
                        <th className="py-3 pr-4 font-medium">Access State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shortlistMatches.map((match) => (
                        <tr key={match.id} className="border-b border-[#e5eaf2] last:border-0">
                          <td className="py-3 pr-4 pl-4 font-medium">{organizationName(data, match.supplierOrgId)}</td>
                          <td className="py-3 pr-4 text-[#64748b]">{facilityName(data, match.facilityId)}</td>
                          <td className="py-3 pr-4 text-2xl font-semibold text-[#0f172a]">{match.score}</td>
                          <td className="py-3 pr-4 text-[#64748b]">{leadTimeEstimate(match.supplierOrgId)}</td>
                          <td className="py-3 pr-4">
                            <StatusBadge
                              tone={statusTone[match.eligibilityStatus]}
                              label={match.eligibilityStatus.replaceAll("_", " ").toLowerCase()}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="grid min-w-0 gap-5 xl:sticky xl:top-24 xl:self-start">
              <section className="rounded-lg border border-[#e5eaf2] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Route size={18} aria-hidden />
                    <h2 className="font-semibold">RFQ workflow</h2>
                  </div>
                  <span className="text-sm font-semibold text-[#2563eb]">{stageProgressPercent}%</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${stageProgressPercent}%` }} />
                </div>
                <div className="mt-4 grid gap-2">
                  {intakeStages.map((stage, index) => {
                    const isActive = index === activeStageIndex;
                    const isComplete = index < activeStageIndex;
                    return (
                      <div
                        key={stage.id}
                        className={`flex items-start gap-3 rounded-md border p-3 ${
                          isActive
                            ? "border-[#bfdbfe] bg-[#eff6ff]"
                            : isComplete
                              ? "border-[#a7f3d0] bg-[#ecfdf5]"
                              : "border-[#e5eaf2] bg-[#f8fafc]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                            isComplete
                              ? "border-[#047857] bg-[#047857] text-white"
                              : isActive
                                ? "border-[#2563eb] bg-[#2563eb] text-white"
                                : "border-[#cbd5e1] text-[#64748b]"
                          }`}
                        >
                          {isComplete ? <Check size={13} aria-hidden /> : index + 1}
                        </span>
                        <div>
                          <p className="font-medium text-[#0f172a]">{stage.title}</p>
                          <p className="mt-0.5 text-xs leading-5 text-[#64748b]">{stage.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border border-[#e5eaf2] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Action queue</h2>
                  <StatusBadge tone="warn" label={`${reviewQueue.length} review`} />
                </div>
                <div className="mt-4 grid gap-3">
                  <button
                    className="flex items-center justify-between gap-3 rounded-md border border-[#e5eaf2] bg-[#f8fafc] px-3 py-2 text-left text-sm hover:border-[#2563eb]"
                    onClick={() => setActiveTab("review")}
                    type="button"
                  >
                    <span>
                      <span className="block font-medium text-[#0f172a]">Review evidence</span>
                      <span className="text-xs text-[#64748b]">Resolve expired or pending documents.</span>
                    </span>
                    <BadgeCheck className="text-[#2563eb]" size={17} aria-hidden />
                  </button>
                  <button
                    className="flex items-center justify-between gap-3 rounded-md border border-[#e5eaf2] bg-[#f8fafc] px-3 py-2 text-left text-sm hover:border-[#2563eb]"
                    onClick={findQualifiedVendorsFromIntake}
                    type="button"
                    disabled={!hasUserProvidedIntakePackage}
                  >
                    <span>
                      <span className="block font-medium text-[#0f172a]">Run qualification</span>
                      <span className="text-xs text-[#64748b]">Create deterministic vendor results.</span>
                    </span>
                    <Search className="text-[#2563eb]" size={17} aria-hidden />
                  </button>
                  <button
                    className="flex items-center justify-between gap-3 rounded-md border border-[#e5eaf2] bg-[#f8fafc] px-3 py-2 text-left text-sm hover:border-[#2563eb]"
                    onClick={dispatchRFQ}
                    type="button"
                  >
                    <span>
                      <span className="block font-medium text-[#0f172a]">Release RFQ</span>
                      <span className="text-xs text-[#64748b]">Send only to evidence-valid suppliers.</span>
                    </span>
                    <Send className="text-[#2563eb]" size={17} aria-hidden />
                  </button>
                </div>
              </section>

              <section className="rounded-lg border border-[#e5eaf2] bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
                <h2 className="font-semibold">Access guardrails</h2>
                <div className="mt-3 grid gap-2">
                  <div className="flex items-center justify-between gap-3 rounded-md border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-sm">
                    <span className="font-medium text-[#047857]">Evidence valid</span>
                    <span className="text-xs text-[#047857]">Invite allowed</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-sm">
                    <span className="font-medium text-[#92400e]">Manual review required</span>
                    <span className="text-xs text-[#92400e]">Hold release</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm">
                    <span className="font-medium text-[#b91c1c]">Access suspended</span>
                    <span className="text-xs text-[#b91c1c]">Blocked</span>
                  </div>
                </div>
              </section>
            </aside>
          </section>

          <section
            id="suppliers"
            className={
              activeTab === "suppliers"
                ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                : "hidden"
            }
          >
            <SectionHeader
              icon={<Factory size={18} aria-hidden />}
              title="Supplier Directory"
              action={
                <label className="flex min-w-0 items-center gap-2 rounded-md border border-[#d8e0eb] px-3 py-2 text-sm">
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
                        ? "border-[#bfdbfe] bg-[#eff6ff]"
                        : "border-[#e5eaf2] bg-[#f8fafc] hover:border-[#2563eb]"
                    }`}
                    onClick={() => setActiveSupplierId(supplier.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{supplier.name}</p>
                        <p className="text-sm text-[#64748b]">
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
                      <p className="text-sm text-[#64748b]">{activeProfile?.summary}</p>
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
                    <thead className="text-[#64748b]">
                      <tr className="border-b border-[#e5eaf2]">
                        <th className="py-2 pr-4 font-medium">Process</th>
                        <th className="py-2 pr-4 font-medium">Materials</th>
                        <th className="py-2 pr-4 font-medium">Tolerance</th>
                        <th className="py-2 pr-4 font-medium">Inspection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCapabilities.map((capability) => (
                        <tr key={capability.id} className="border-b border-[#e5eaf2]">
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

          <section
            id="evidence"
            className={activeTab === "review" ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]" : "hidden"}
          >
            <SectionHeader icon={<BadgeCheck size={18} aria-hidden />} title="Evidence Review Queue" />
            <div className="grid gap-3 p-4">
              {reviewQueue.map((evidence) => (
                <div
                  key={evidence.id}
                  className="grid gap-3 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{evidenceLabels[evidence.type]}</p>
                      <StatusBadge tone={evidenceTone(evidence.status)} label={evidence.status.replaceAll("_", " ").toLowerCase()} />
                      <span className="text-sm text-[#64748b]">{organizationName(data, evidence.supplierOrgId)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#64748b]">{evidence.scopeText}</p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      Source: {evidence.source.replaceAll("_", " ").toLowerCase()} · Expires{" "}
                      {evidence.expirationDate ?? "not specified"}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs">
                      <p className={evidence.status === "EXPIRED" ? "text-[#8a2f25]" : "text-[#64748b]"}>
                        {evidenceWarning(evidence)}
                      </p>
                      {evidence.notes ? <p className="text-[#64748b]">Reviewer note: {evidence.notes}</p> : null}
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

          <section
            id="work-packages"
            className={activeTab === "review" ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]" : "hidden"}
          >
            <SectionHeader icon={<PackagePlus size={18} aria-hidden />} title="Work Package Builder" />
            <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_440px]">
              <div className="grid gap-3">
                {data.workPackages.map((workPackage) => (
                  <button
                    key={workPackage.id}
                    className={`rounded-lg border p-3 text-left ${
                      selectedWorkPackageId === workPackage.id
                        ? "border-[#bfdbfe] bg-[#eff6ff]"
                        : "border-[#e5eaf2] bg-[#f8fafc]"
                    }`}
                    onClick={() => setSelectedWorkPackageId(workPackage.id)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{workPackage.title}</p>
                        <p className="text-sm text-[#64748b]">{workPackage.description}</p>
                      </div>
                      <StatusBadge tone={workPackage.status === "READY_TO_MATCH" ? "good" : "warn"} label={workPackage.status.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#334155]">
                      <span className="rounded-md border border-[#d8e0eb] bg-[#ffffff] px-2 py-1">
                        {workPackage.dataClassification}
                      </span>
                      <span className="rounded-md border border-[#d8e0eb] bg-[#ffffff] px-2 py-1">
                        {workPackage.requiredProcesses.map((process) => processLabels[process]).join(", ")}
                      </span>
                      <span className="rounded-md border border-[#d8e0eb] bg-[#ffffff] px-2 py-1">
                        {workPackage.requiredMaterials.join(", ")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-3 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Title</span>
                  <input
                    className="rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-[#0f172a] outline-none"
                    value={builder.title}
                    onChange={(event) => setBuilder({ ...builder, title: event.target.value })}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="font-medium">Classification</span>
                    <select
                      className="rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-[#0f172a] outline-none"
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
                      className="rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-[#0f172a] outline-none"
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
                      className="rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-[#0f172a] outline-none"
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
                      className="rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-[#0f172a] outline-none"
                      inputMode="decimal"
                      value={builder.tolerance}
                      onChange={(event) => setBuilder({ ...builder, tolerance: event.target.value })}
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Quantity</span>
                  <input
                    className="rounded-md border border-[#d8e0eb] bg-[#f1f5f9] px-3 py-2 text-[#0f172a] outline-none"
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
                <div className="grid gap-2 sm:flex sm:flex-wrap">
                  <CommandButton className="w-full sm:w-auto" label="Create Work Package" onClick={createWorkPackage}>
                    <PackagePlus size={16} aria-hidden />
                  </CommandButton>
                  <CommandButton className="w-full sm:w-auto" label="Approve Classification" onClick={approveClassification}>
                    <Gavel size={16} aria-hidden />
                  </CommandButton>
                </div>
              </div>
            </div>
          </section>

          <section
            id="matching"
            className={activeTab === "qualification" ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]" : "hidden"}
          >
            <SectionHeader
              icon={<Search size={18} aria-hidden />}
              title="Matching Results"
              action={
                <CommandButton className="w-full sm:w-auto" label="Run Matching" onClick={runMatchForSelected}>
                  <Search size={16} aria-hidden />
                </CommandButton>
              }
            />
            <div className="grid gap-4 p-4">
              <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {(["ALL", "ELIGIBLE", "MANUAL_REVIEW", "INELIGIBLE"] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`shrink-0 rounded-md border px-3 py-2 text-sm ${
                      matchFilter === filter
                        ? "border-[#2563eb] bg-[#2563eb] text-white"
                        : "border-[#d8e0eb] bg-[#f8fafc] text-[#334155]"
                    }`}
                    onClick={() => setMatchFilter(filter)}
                    type="button"
                  >
                    {filter.replaceAll("_", " ").toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 md:hidden">
                {filteredMatches.map((match) => {
                  const selected = selectedInviteSuppliers.includes(match.supplierOrgId);
                  return (
                    <div key={match.id} className="rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{organizationName(data, match.supplierOrgId)}</p>
                          <p className="mt-1 text-xs text-[#64748b]">{facilityName(data, match.facilityId)}</p>
                        </div>
                        <p className="shrink-0 text-2xl font-semibold">{match.score}</p>
                      </div>
                      <div className="mt-3">
                        <StatusBadge
                          tone={statusTone[match.eligibilityStatus]}
                          label={match.eligibilityStatus.replaceAll("_", " ").toLowerCase()}
                        />
                      </div>
                      <p className="mt-3 text-sm text-[#334155]">
                        {match.reasons[0] ?? "Facility capability reviewed."}
                      </p>
                      <p className="mt-1 text-xs text-[#64748b]">
                        {match.blockers[0] ??
                          (match.eligibilityStatus === "ELIGIBLE"
                            ? "Evidence valid for controlled RFQ routing."
                            : "Manual review required before release.")}
                      </p>
                      <label
                        className={`mt-3 flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                          selected
                            ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]"
                            : "border-[#d8e0eb] bg-[#f8fafc] text-[#334155]"
                        }`}
                      >
                        <span>{match.eligibilityStatus === "ELIGIBLE" ? "Include in RFQ release" : "Flag for review"}</span>
                        <input
                          checked={selected}
                          onChange={(event) => toggleInviteSupplier(match.supplierOrgId, event.target.checked)}
                          type="checkbox"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto rounded-lg border border-[#e5eaf2] md:block">
                <table className="min-w-[940px] text-left text-sm">
                  <thead className="bg-[#f8fafc] text-[#64748b]">
                    <tr className="border-b border-[#e5eaf2]">
                      <th className="py-2 pr-4 pl-3 font-medium">Supplier</th>
                      <th className="py-2 pr-4 font-medium">Capability</th>
                      <th className="py-2 pr-4 font-medium">Evidence / Access</th>
                      <th className="py-2 pr-4 font-medium">Score</th>
                      <th className="py-2 pr-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatches.map((match) => {
                      const selected = selectedInviteSuppliers.includes(match.supplierOrgId);
                      return (
                        <tr key={match.id} className="border-b border-[#e5eaf2] last:border-0">
                          <td className="py-3 pr-4 pl-3 align-top">
                            <p className="font-medium">{organizationName(data, match.supplierOrgId)}</p>
                            <p className="mt-1 text-xs text-[#64748b]">{facilityName(data, match.facilityId)}</p>
                          </td>
                          <td className="max-w-[340px] py-3 pr-4 align-top">
                            <p>{match.reasons[0] ?? "Facility capability reviewed."}</p>
                            <p className="mt-1 text-xs text-[#64748b]">
                              {match.capacitySignals[0] ?? leadTimeEstimate(match.supplierOrgId)}
                            </p>
                          </td>
                          <td className="max-w-[360px] py-3 pr-4 align-top">
                            <StatusBadge
                              tone={statusTone[match.eligibilityStatus]}
                              label={match.eligibilityStatus.replaceAll("_", " ").toLowerCase()}
                            />
                            <p className="mt-2 text-xs text-[#64748b]">
                              {match.blockers[0] ??
                                (match.eligibilityStatus === "ELIGIBLE"
                                  ? "Evidence valid for controlled RFQ routing."
                                  : "Manual review required before release.")}
                            </p>
                          </td>
                          <td className="py-3 pr-4 align-top text-2xl font-semibold">{match.score}</td>
                          <td className="py-3 pr-3 align-top">
                            <label
                              className={`flex items-center gap-2 text-sm ${
                                selected ? "text-[#2563eb]" : "text-[#334155]"
                              }`}
                            >
                              <input
                                checked={selected}
                                onChange={(event) => toggleInviteSupplier(match.supplierOrgId, event.target.checked)}
                                type="checkbox"
                              />
                              {match.eligibilityStatus === "ELIGIBLE" ? "Release" : "Review"}
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section
            id="dispatch"
            className={activeTab === "rfq" ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]" : "hidden"}
          >
            <SectionHeader
              icon={<Send size={18} aria-hidden />}
              title="RFQ Dispatch"
              action={
                <CommandButton className="w-full sm:w-auto" label="Release Invites" onClick={dispatchRFQ}>
                  <Send size={16} aria-hidden />
                </CommandButton>
              }
            />
            <div className="grid gap-3 p-4">
              {data.rfqInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-3 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{organizationName(data, invite.supplierOrgId)}</p>
                      <StatusBadge tone={invite.accessStatus === "RELEASED" ? "good" : "bad"} label={invite.accessStatus.replaceAll("_", " ").toLowerCase()} />
                      <StatusBadge tone="neutral" label={invite.responseStatus.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {workPackageName(data, invite.workPackageId)} · expires {formatDate(invite.expiresAt)}
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">{inviteResponseDetail(invite)}</p>
                  </div>
                  <IconButton label="Revoke invite" onClick={() => revokeInvite(invite.id)}>
                    <LockKeyhole size={16} aria-hidden />
                  </IconButton>
                </div>
              ))}
            </div>
          </section>

          <section
            id="portal"
            className={activeTab === "rfq" ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]" : "hidden"}
          >
            <SectionHeader icon={<UserCheck size={18} aria-hidden />} title="Supplier RFQ Portal" />
            <div className="grid gap-4 p-4">
              <div className="rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileLock2 className="mt-0.5 text-[#2563eb]" size={18} aria-hidden />
                  <p>{accessDecision}</p>
                </div>
              </div>
              {portalInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="grid gap-3 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{workPackageName(data, invite.workPackageId)}</p>
                      <StatusBadge tone={invite.accessStatus === "RELEASED" ? "good" : "bad"} label={invite.accessStatus.replaceAll("_", " ").toLowerCase()} />
                      <StatusBadge tone="neutral" label={invite.responseStatus.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <p className="mt-1 text-sm text-[#64748b]">
                      Data-room access expires {formatDate(invite.expiresAt)}. Blueprint files are not emailed.
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">{inviteResponseDetail(invite)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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

          <section
            id="audit"
            className={activeTab === "audit" ? "min-w-0 rounded-2xl border border-[#e5eaf2] bg-[#ffffff] shadow-[0_12px_30px_rgba(15,23,42,0.06)]" : "hidden"}
          >
            <SectionHeader
              icon={<History size={18} aria-hidden />}
              title="Audit Log"
              action={
                <label className="flex w-full min-w-0 items-center gap-2 rounded-md border border-[#d8e0eb] px-3 py-2 text-sm sm:w-auto">
                  <Filter size={16} aria-hidden />
                  <input
                    className="w-full bg-transparent outline-none sm:w-44"
                    placeholder="Filter audit"
                    value={auditFilter}
                    onChange={(event) => setAuditFilter(event.target.value)}
                  />
                </label>
              }
            />
            <div className="grid gap-3 border-b border-[#e5eaf2] p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div>
                <p className="font-medium">Audit Export</p>
                <p className="mt-1 text-sm text-[#64748b]">
                  This view is formatted for a buyer review: who saw what, when, and why.
                </p>
              </div>
              <a
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"
                download="sovereign-source-audit-export.txt"
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(auditExportText)}`}
              >
                <Download size={16} aria-hidden />
                Download Audit Export
              </a>
              <pre className="max-h-48 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 text-xs text-[#334155] lg:col-span-2">
                {auditExportText}
              </pre>
            </div>
            <div className="grid gap-3 p-3 md:hidden">
              {auditLogs.map((log) => (
                <div key={log.id} className="min-w-0 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{describeAuditAction(log.action)}</p>
                      <p className="mt-1 text-xs text-[#64748b]">{formatDateTime(log.createdAt)}</p>
                    </div>
                    <StatusBadge tone="neutral" label={log.entityType.toLowerCase()} />
                  </div>
                  <p className="mt-3 break-words text-xs text-[#64748b]">
                    {organizationName(data, String(log.orgId ?? ""))} · {log.entityId}
                  </p>
                  <pre className="mt-2 max-h-24 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#f1f5f9] p-2 text-xs text-[#64748b]">
                    {JSON.stringify(log.metadataJson)}
                  </pre>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto p-4 md:block">
              <table className="min-w-[900px] text-left text-sm">
                <thead className="text-[#64748b]">
                  <tr className="border-b border-[#e5eaf2]">
                    <th className="py-2 pr-4 font-medium">Time</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Entity</th>
                    <th className="py-2 pr-4 font-medium">Org</th>
                    <th className="py-2 pr-4 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-[#e5eaf2]">
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className="py-3 pr-4">{describeAuditAction(log.action)}</td>
                      <td className="py-3 pr-4">
                        {log.entityType} · {log.entityId}
                      </td>
                      <td className="py-3 pr-4">{organizationName(data, String(log.orgId ?? ""))}</td>
                      <td className="max-w-[360px] py-3 pr-4 text-xs text-[#64748b]">
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
      {dataRoomInvite ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-[#111814]/60 p-2 sm:place-items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-auto rounded-t-lg border border-[#e5eaf2] bg-[#ffffff] shadow-xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b border-[#e5eaf2] p-3 sm:p-4">
              <div>
                <p className="text-sm text-[#64748b]">Secure data room</p>
                <h2 className="text-lg font-semibold">{workPackageName(data, dataRoomInvite.workPackageId)}</h2>
                <p className="mt-1 text-sm text-[#64748b]">
                  Released to {organizationName(data, dataRoomInvite.supplierOrgId)} until {formatDate(dataRoomInvite.expiresAt)}.
                </p>
              </div>
              <IconButton label="Close data room" onClick={() => setDataRoomInviteId(undefined)}>
                <X size={16} aria-hidden />
              </IconButton>
            </div>
            <div className="grid gap-3 p-3 sm:p-4">
              <div className="rounded-lg border border-[#dfc47a] bg-[#fff9e7] p-3 text-sm text-[#74581b]">
                File access is gated by invite status, evidence state, and audit policy before release.
              </div>
              {dataRoomDocuments.map((document) => (
                <div
                  key={document.id}
                  className="grid gap-3 rounded-lg border border-[#e5eaf2] bg-[#f8fafc] p-3 sm:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileLock2 size={16} aria-hidden />
                      <p className="min-w-0 break-words font-medium">{document.filename}</p>
                      <StatusBadge tone="neutral" label={document.classification.replaceAll("_", " ").toLowerCase()} />
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">
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
      </div>
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
    <div className="flex flex-col gap-3 border-b border-[#e5eaf2] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#d8e0eb] bg-[#f8fafc] text-[#2563eb]">
          {icon}
        </span>
        <h2 className="truncate text-base font-semibold text-[#0f172a]">{title}</h2>
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
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
    <div className="rounded-2xl border border-[#e5eaf2] bg-[#ffffff] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#64748b]">{label}</p>
          <p className="mt-2 text-2xl font-semibold sm:text-3xl">{value}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-sm text-[#64748b]">{detail}</p>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e5eaf2] bg-[#ffffff] p-3 text-sm text-[#64748b]">
      <p className="mb-2 font-medium text-[#0f172a]">{title}</p>
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

function StatusBadge({
  tone,
  label,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  label: string;
}) {
  const toneClass = {
    good: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
    warn: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    bad: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
    neutral: "border-[#d8e0eb] bg-[#f8fafc] text-[#334155]",
  }[tone];

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-semibold leading-snug ${toneClass}`}
    >
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
      className="grid size-9 shrink-0 place-items-center rounded-md border border-[#d8e0eb] bg-[#f8fafc] text-[#334155] hover:border-[#2563eb]"
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
  className = "",
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md border border-[#2563eb] bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      disabled={disabled}
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

function leadTimeEstimate(supplierOrgId: string) {
  const estimates: Record<string, string> = {
    "sup-a": "42 day lead-time signal",
    "sup-e": "52 day lead-time signal",
    "sup-d": "94 day lead-time signal",
  };
  return estimates[supplierOrgId] ?? "lead-time signal pending";
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

function buildUploadedPackageSummary(files: IntakeFile[]): IntakePackageSummary {
  const extensions = files.map((file) => fileExtension(file.name));
  const hasLineList = extensions.some((extension) => ["csv", "xls", "xlsx"].includes(extension));
  const packageTitle =
    files.length === 1
      ? files[0]?.name.replace(/\.[^.]+$/, "") || "Uploaded sourcing package"
      : "Uploaded sourcing package";

  return {
    title: packageTitle.replaceAll("_", " "),
    classificationLabel: "classification pending",
    processLabel: hasLineList ? "drawing + PO/BOM intake" : "drawing/model intake",
    quantityLabel: hasLineList ? "line items pending review" : "quantity pending",
  };
}

function getDetectedRequirementChips(files: IntakeFile[]) {
  if (files.length === 0) {
    return ["No package uploaded"];
  }

  const extensions = files.map((file) => fileExtension(file.name));
  const packageText = files.map((file) => file.name).join(" ").toLowerCase();
  const hasStep = extensions.includes("step") || extensions.includes("stp");
  const hasPdf = extensions.includes("pdf");
  const hasLineList = extensions.some((extension) => ["csv", "xls", "xlsx"].includes(extension));
  const hasNativeCad = extensions.some((extension) => nativeCadExtensions.has(extension));

  if (hasNativeCad && !hasStep && !hasPdf) {
    return ["Native CAD stored", "manual review required", "geometry export needed", "requirements not confirmed"];
  }

  const detected = [
    packageText.includes("5-axis") || packageText.includes("5_axis") ? "5-axis CNC" : undefined,
    packageText.includes("3-axis") || packageText.includes("3_axis") ? "3-axis CNC" : undefined,
    packageText.includes("titanium") ? "Titanium" : undefined,
    packageText.includes("aluminum") ? "Aluminum" : undefined,
    hasStep ? "STEP/STP model" : undefined,
    hasPdf ? "PDF drawing" : undefined,
    hasLineList ? "PO/BOM line list" : undefined,
    hasNativeCad ? "Native CAD stored" : undefined,
    /as9102|fair|cmm|coc|inspection/.test(packageText) ? "CMM / FAIR" : undefined,
    /itar|controlled/.test(packageText) ? "Controlled data review" : undefined,
    packageText.includes("cui") ? "CUI review" : undefined,
  ].filter((item): item is string => Boolean(item));

  return detected.length > 0 ? detected : ["manual review required", "requirements not confirmed"];
}

function getIntakePackageWarnings(files: IntakeFile[]): IntakePackageWarning[] {
  if (files.length === 0) {
    return [];
  }

  const extensions = files.map((file) => fileExtension(file.name));
  const hasPdf = extensions.includes("pdf");
  const hasStep = extensions.includes("step") || extensions.includes("stp");
  const hasLineList = extensions.some((extension) => ["csv", "xls", "xlsx"].includes(extension));
  const hasZip = extensions.includes("zip");
  const hasNativeCad = extensions.some((extension) => nativeCadExtensions.has(extension));
  const hasMaterialSignal = files.some((file) =>
    /aluminum|steel|stainless|titanium|inconel|copper|brass|magnesium|monel|hastelloy/i.test(file.name),
  );
  const hasInspectionSignal = files.some((file) => /inspection|cmm|fair|as9102|quality|qc/i.test(file.name));
  const hasControlSignal = files.some((file) => /controlled|itar|cui|export|dfars|dod|defense|jcp/i.test(file.name));

  const warnings: IntakePackageWarning[] = [];

  if (!hasPdf) {
    warnings.push({
      title: "Missing PDF drawing",
      detail: "Tolerances, GD&T, material notes, finish, inspection, and revision usually need the drawing.",
    });
  }

  if (hasNativeCad) {
    warnings.push({
      title: "Native CAD requires review",
      detail: "Store native CAD, but request STEP/STP export before relying on geometry detection.",
    });
  }

  if (!hasStep && hasNativeCad) {
    warnings.push({
      title: "Missing STEP/STP model",
      detail: "STEP/STP is the preferred neutral model for geometry and rough manufacturability review.",
    });
  }

  if (!hasMaterialSignal && !hasPdf) {
    warnings.push({
      title: "No material spec detected",
      detail: "Use the drawing or PO line list to confirm alloy, temper, spec, and domestic-material requirements.",
    });
  }

  if (!hasInspectionSignal && !hasPdf && !hasZip) {
    warnings.push({
      title: "No inspection requirement detected",
      detail: "Aerospace packages often need FAIR, CMM report, source inspection, CoC, or lot traceability.",
    });
  }

  if (!hasControlSignal && !hasPdf && !hasZip) {
    warnings.push({
      title: "Controlled data marking requires review",
      detail: "Confirm ITAR, CUI, CDI, export-control, JCP, and flowdown markings before RFQ release.",
    });
  }

  if (!hasLineList && files.length > 1) {
    warnings.push({
      title: "No PO/BOM line list detected",
      detail: "Add XLSX or CSV when quantities, due dates, and multiple part lines should be extracted.",
    });
  }

  return warnings;
}

function fileExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function isDrawingFile(fileName: string) {
  return fileExtension(fileName) === "pdf";
}

function isFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes("Files");
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
