-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('BUYER', 'SUPPLIER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER_ADMIN', 'BUYER_PROCUREMENT', 'SUPPLIER_ADMIN', 'SUPPLIER_ESTIMATOR', 'COMPLIANCE_REVIEWER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('DEVELOPMENTAL', 'SCALING', 'MASS_PRODUCTION');

-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('CNC_3_AXIS', 'CNC_5_AXIS', 'EDM', 'GRINDING', 'TURNING', 'SHEET_METAL', 'ADDITIVE', 'INJECTION_MOLDING', 'NDT', 'HEAT_TREAT', 'COATING', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('SAM_ACTIVE', 'SAM_EXCLUSION_CLEAR', 'ITAR_REGISTRATION_EVIDENCE', 'JCP_DD2345', 'CMMC_LEVEL_2', 'NIST_800_171_SCORE', 'ISO_9001', 'AS9100', 'NADCAP', 'NAVSEA_SUBSAFE', 'CUSTOMER_APPROVED', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING_REVIEW', 'VALID', 'EXPIRES_SOON', 'EXPIRED', 'REJECTED', 'MANUAL_REQUIRED');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('REGISTRY', 'SUPPLIER_UPLOAD', 'BUYER_APPROVED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'FCI', 'CUI', 'ITAR_TECHNICAL_DATA', 'EAR_CONTROLLED', 'JCP_REQUIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WorkPackageStatus" AS ENUM ('DRAFT', 'CLASSIFICATION_REVIEW', 'READY_TO_MATCH', 'RFQ_SENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ELIGIBLE', 'INELIGIBLE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('NOT_RELEASED', 'RELEASED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'QUOTED', 'DECLINED', 'NO_BID');

-- CreateEnum
CREATE TYPE "RFQStatus" AS ENUM ('DRAFT', 'SENT', 'CLOSED');

-- CreateEnum
CREATE TYPE "CapacitySignalType" AS ENUM ('DECLARED_AVAILABILITY', 'RFQ_RESPONSE_TIME', 'NO_BID_REASON', 'QUOTED_LEAD_TIME', 'DELIVERY_HISTORY');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "cageCode" TEXT,
    "uei" TEXT,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT,
    "cageCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "id" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "lifecycleStage" "LifecycleStage" NOT NULL,
    "summary" TEXT NOT NULL,
    "website" TEXT,
    "primaryContact" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "materials" TEXT[],
    "toleranceMinInches" DECIMAL(65,30) NOT NULL,
    "maxPartSize" TEXT NOT NULL,
    "quantityMin" INTEGER NOT NULL,
    "quantityMax" INTEGER NOT NULL,
    "inspectionCapabilities" TEXT[],
    "notes" TEXT,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "axisCount" INTEGER,
    "envelope" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvidence" (
    "id" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "facilityId" TEXT,
    "type" "EvidenceType" NOT NULL,
    "status" "EvidenceStatus" NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "scopeText" TEXT NOT NULL,
    "certificateNumber" TEXT,
    "issuingBody" TEXT,
    "issueDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "fileUrl" TEXT,

    CONSTRAINT "ComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryCheck" (
    "id" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawResultJson" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacitySignal" (
    "id" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "facilityId" TEXT,
    "signalType" "CapacitySignalType" NOT NULL,
    "valueJson" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapacitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPackage" (
    "id" TEXT NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dataClassification" "DataClassification" NOT NULL,
    "classificationApprovedBy" TEXT,
    "classificationApprovedAt" TIMESTAMP(3),
    "requiredCompliance" "EvidenceType"[],
    "requiredProcesses" "ProcessType"[],
    "requiredMaterials" TEXT[],
    "requiredInspection" TEXT[],
    "toleranceRequiredInches" DECIMAL(65,30),
    "quantity" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "lifecycleStageTarget" "LifecycleStage" NOT NULL,
    "status" "WorkPackageStatus" NOT NULL,

    CONSTRAINT "WorkPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "workPackageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "classification" "DataClassification" NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierMatch" (
    "id" TEXT NOT NULL,
    "workPackageId" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "eligibilityStatus" "MatchStatus" NOT NULL,
    "score" INTEGER NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "blockersJson" JSONB NOT NULL,
    "capacityJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQ" (
    "id" TEXT NOT NULL,
    "workPackageId" TEXT NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "status" "RFQStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "RFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQInvite" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "workPackageId" TEXT NOT NULL,
    "supplierOrgId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "accessStatus" "AccessStatus" NOT NULL,
    "secureTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "responseStatus" "ResponseStatus" NOT NULL,
    "noBidReason" TEXT,
    "quotedLeadTimeDays" INTEGER,
    "quoteAmount" DECIMAL(65,30),

    CONSTRAINT "RFQInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "orgId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProfile_supplierOrgId_key" ON "SupplierProfile"("supplierOrgId");

-- CreateIndex
CREATE INDEX "ComplianceEvidence_supplierOrgId_type_status_idx" ON "ComplianceEvidence"("supplierOrgId", "type", "status");

-- CreateIndex
CREATE INDEX "SupplierMatch_workPackageId_eligibilityStatus_idx" ON "SupplierMatch"("workPackageId", "eligibilityStatus");

-- CreateIndex
CREATE INDEX "AuditLog_action_entityType_idx" ON "AuditLog"("action", "entityType");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryCheck" ADD CONSTRAINT "RegistryCheck_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacitySignal" ADD CONSTRAINT "CapacitySignal_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacitySignal" ADD CONSTRAINT "CapacitySignal_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPackage" ADD CONSTRAINT "WorkPackage_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierMatch" ADD CONSTRAINT "SupplierMatch_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierMatch" ADD CONSTRAINT "SupplierMatch_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierMatch" ADD CONSTRAINT "SupplierMatch_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQ" ADD CONSTRAINT "RFQ_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQ" ADD CONSTRAINT "RFQ_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQInvite" ADD CONSTRAINT "RFQInvite_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQInvite" ADD CONSTRAINT "RFQInvite_supplierOrgId_fkey" FOREIGN KEY ("supplierOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFQInvite" ADD CONSTRAINT "RFQInvite_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
