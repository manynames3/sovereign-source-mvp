export type OrganizationType = "BUYER" | "SUPPLIER" | "PLATFORM";

export type UserRole =
  | "BUYER_ADMIN"
  | "BUYER_PROCUREMENT"
  | "SUPPLIER_ADMIN"
  | "SUPPLIER_ESTIMATOR"
  | "COMPLIANCE_REVIEWER"
  | "PLATFORM_ADMIN";

export type LifecycleStage = "DEVELOPMENTAL" | "SCALING" | "MASS_PRODUCTION";

export type ProcessType =
  | "CNC_3_AXIS"
  | "CNC_5_AXIS"
  | "EDM"
  | "GRINDING"
  | "TURNING"
  | "SHEET_METAL"
  | "ADDITIVE"
  | "INJECTION_MOLDING"
  | "NDT"
  | "HEAT_TREAT"
  | "COATING"
  | "OTHER";

export type EvidenceType =
  | "SAM_ACTIVE"
  | "SAM_EXCLUSION_CLEAR"
  | "ITAR_REGISTRATION_EVIDENCE"
  | "JCP_DD2345"
  | "CMMC_LEVEL_2"
  | "NIST_800_171_SCORE"
  | "ISO_9001"
  | "AS9100"
  | "NADCAP"
  | "NAVSEA_SUBSAFE"
  | "CUSTOMER_APPROVED"
  | "OTHER";

export type EvidenceStatus =
  | "PENDING_REVIEW"
  | "VALID"
  | "EXPIRES_SOON"
  | "EXPIRED"
  | "REJECTED"
  | "MANUAL_REQUIRED";

export type EvidenceSource =
  | "REGISTRY"
  | "SUPPLIER_UPLOAD"
  | "BUYER_APPROVED"
  | "MANUAL_REVIEW";

export type DataClassification =
  | "PUBLIC"
  | "FCI"
  | "CUI"
  | "ITAR_TECHNICAL_DATA"
  | "EAR_CONTROLLED"
  | "JCP_REQUIRED"
  | "UNKNOWN";

export type WorkPackageStatus =
  | "DRAFT"
  | "CLASSIFICATION_REVIEW"
  | "READY_TO_MATCH"
  | "RFQ_SENT"
  | "CLOSED";

export type MatchStatus = "ELIGIBLE" | "INELIGIBLE" | "MANUAL_REVIEW";

export type AccessStatus = "NOT_RELEASED" | "RELEASED" | "REVOKED" | "EXPIRED";

export type ResponseStatus = "PENDING" | "QUOTED" | "DECLINED" | "NO_BID";

export type CapacitySignalType =
  | "DECLARED_AVAILABILITY"
  | "RFQ_RESPONSE_TIME"
  | "NO_BID_REASON"
  | "QUOTED_LEAD_TIME"
  | "DELIVERY_HISTORY";

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  cageCode?: string;
  uei?: string;
  country: string;
  state?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Facility {
  id: string;
  supplierOrgId: string;
  name: string;
  address: string;
  country: string;
  state?: string;
  cageCode?: string;
  isActive: boolean;
}

export interface SupplierProfile {
  id: string;
  supplierOrgId: string;
  lifecycleStage: LifecycleStage;
  summary: string;
  website?: string;
  primaryContact: string;
  status: "ACTIVE" | "NEEDS_REVIEW" | "SUSPENDED";
}

export interface Capability {
  id: string;
  facilityId: string;
  processType: ProcessType;
  materials: string[];
  toleranceMinInches: number;
  maxPartSize: string;
  quantityMin: number;
  quantityMax: number;
  inspectionCapabilities: string[];
  notes?: string;
}

export interface Machine {
  id: string;
  facilityId: string;
  name: string;
  type: string;
  axisCount?: number;
  envelope: string;
  notes?: string;
}

export interface ComplianceEvidence {
  id: string;
  supplierOrgId: string;
  facilityId?: string;
  type: EvidenceType;
  status: EvidenceStatus;
  source: EvidenceSource;
  scopeText: string;
  certificateNumber?: string;
  issuingBody?: string;
  issueDate?: string;
  expirationDate?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
  fileUrl?: string;
}

export interface RegistryCheck {
  id: string;
  supplierOrgId: string;
  type: string;
  status: string;
  rawResultJson: Record<string, unknown>;
  checkedAt: string;
}

export interface CapacitySignal {
  id: string;
  supplierOrgId: string;
  facilityId?: string;
  signalType: CapacitySignalType;
  valueJson: Record<string, string | number | boolean>;
  observedAt: string;
}

export interface WorkPackage {
  id: string;
  buyerOrgId: string;
  title: string;
  description: string;
  dataClassification: DataClassification;
  classificationApprovedBy?: string;
  classificationApprovedAt?: string;
  requiredCompliance: EvidenceType[];
  requiredProcesses: ProcessType[];
  requiredMaterials: string[];
  requiredInspection: string[];
  toleranceRequiredInches?: number;
  quantity: number;
  dueDate: string;
  lifecycleStageTarget: LifecycleStage;
  status: WorkPackageStatus;
}

export interface DocumentRecord {
  id: string;
  workPackageId: string;
  filename: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
  classification: DataClassification;
  uploadedBy: string;
  createdAt: string;
}

export interface SupplierMatch {
  id: string;
  workPackageId: string;
  supplierOrgId: string;
  facilityId: string;
  eligibilityStatus: MatchStatus;
  score: number;
  reasons: string[];
  blockers: string[];
  capacitySignals: string[];
  createdAt: string;
}

export interface RFQ {
  id: string;
  workPackageId: string;
  buyerOrgId: string;
  status: "DRAFT" | "SENT" | "CLOSED";
  createdAt: string;
  sentAt?: string;
}

export interface RFQInvite {
  id: string;
  rfqId: string;
  workPackageId: string;
  supplierOrgId: string;
  facilityId: string;
  accessStatus: AccessStatus;
  secureTokenHash: string;
  expiresAt: string;
  sentAt?: string;
  viewedAt?: string;
  responseStatus: ResponseStatus;
  noBidReason?: string;
  quotedLeadTimeDays?: number;
  quoteAmount?: number;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  orgId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadataJson: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface DemoData {
  organizations: Organization[];
  users: User[];
  facilities: Facility[];
  supplierProfiles: SupplierProfile[];
  capabilities: Capability[];
  machines: Machine[];
  complianceEvidence: ComplianceEvidence[];
  registryChecks: RegistryCheck[];
  capacitySignals: CapacitySignal[];
  workPackages: WorkPackage[];
  documents: DocumentRecord[];
  rfqs: RFQ[];
  rfqInvites: RFQInvite[];
  auditLogs: AuditLog[];
}

export const controlledClassifications: DataClassification[] = [
  "CUI",
  "ITAR_TECHNICAL_DATA",
  "EAR_CONTROLLED",
  "JCP_REQUIRED",
];

export const evidenceLabels: Record<EvidenceType, string> = {
  SAM_ACTIVE: "SAM active",
  SAM_EXCLUSION_CLEAR: "SAM exclusion clear",
  ITAR_REGISTRATION_EVIDENCE: "ITAR registration evidence",
  JCP_DD2345: "JCP DD2345",
  CMMC_LEVEL_2: "CMMC Level 2",
  NIST_800_171_SCORE: "NIST 800-171 score",
  ISO_9001: "ISO 9001",
  AS9100: "AS9100",
  NADCAP: "Nadcap",
  NAVSEA_SUBSAFE: "NAVSEA SUBSAFE",
  CUSTOMER_APPROVED: "Customer approved",
  OTHER: "Other evidence",
};

export const processLabels: Record<ProcessType, string> = {
  CNC_3_AXIS: "CNC 3-axis",
  CNC_5_AXIS: "CNC 5-axis",
  EDM: "EDM",
  GRINDING: "Grinding",
  TURNING: "Turning",
  SHEET_METAL: "Sheet metal",
  ADDITIVE: "Additive",
  INJECTION_MOLDING: "Injection molding",
  NDT: "NDT",
  HEAT_TREAT: "Heat treat",
  COATING: "Coating",
  OTHER: "Other",
};

export const statusTone: Record<MatchStatus, "good" | "warn" | "bad"> = {
  ELIGIBLE: "good",
  MANUAL_REVIEW: "warn",
  INELIGIBLE: "bad",
};
