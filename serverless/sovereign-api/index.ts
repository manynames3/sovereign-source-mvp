import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, ScheduledEvent } from "aws-lambda";
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { demoData } from "../../src/lib/seed";
import type {
  AuditLog,
  Capability,
  CapacitySignal,
  ComplianceEvidence,
  DocumentRecord,
  Facility,
  Machine,
  Organization,
  RegistryCheck,
  RFQ,
  RFQInvite,
  SupplierMatch,
  SupplierProfile,
  User,
  UserRole,
  WorkPackage,
} from "../../src/lib/domain";
import {
  ApiError,
  buildAudit,
  buyerWriteRoles,
  createId,
  createInviteToken,
  evaluateEvidenceExpiration,
  evaluateDataRoomAccess,
  hashInviteToken,
  requireAnyRole,
  resolveTenantId,
  reviewerRoles,
  runTenantMatching,
  type CurrentUser,
} from "./core";

const tableName = requiredEnv("TABLE_NAME");
const documentBucket = requiredEnv("DOCUMENT_BUCKET");
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const cognitoIssuer = process.env.COGNITO_ISSUER ?? "";
const cognitoClientId = process.env.COGNITO_CLIENT_ID ?? "";
const allowDevAuth = process.env.ALLOW_DEV_AUTH === "true";

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});
let jwksCache: JsonWebKey[] | undefined;

type StoredItem = Record<string, unknown> & {
  pk: string;
  sk: string;
  kind: string;
  tenantId?: string;
  id?: string;
};

export async function handler(
  event: APIGatewayProxyEventV2 | ScheduledEvent,
): Promise<APIGatewayProxyStructuredResultV2 | Record<string, unknown>> {
  if (isScheduledEvent(event)) {
    return expireEvidenceForAllTenants(new Date());
  }

  const origin = event.headers.origin ?? event.headers.Origin;

  if (event.requestContext.http.method === "OPTIONS") {
    return empty(204, origin);
  }

  try {
    const method = event.requestContext.http.method;
    const path = normalizePath(event.rawPath);

    if (method === "GET" && path === "/health") {
      return json(200, { status: "ok" }, origin);
    }

    if (method === "POST" && path === "/access/request") {
      return json(200, await createAccessRequest(event), origin);
    }

    const user = await authenticate(event);

    if (method === "GET" && path === "/me") {
      return json(200, { user }, origin);
    }

    if (method === "GET" && path === "/dashboard/state") {
      return json(200, await getDashboardState(user, event.queryStringParameters ?? {}), origin);
    }

    if (method === "POST" && path === "/admin/demo-seed") {
      return json(200, await seedDemoTenant(user, await readJson(event)), origin);
    }

    if (method === "GET" && path === "/admin/buyer-orgs") {
      return json(200, await listBuyerOrgs(user, event.queryStringParameters ?? {}), origin);
    }

    if (method === "POST" && path === "/admin/buyer-orgs") {
      return json(200, await createBuyerOrg(user, await readJson(event), event), origin);
    }

    if (method === "GET" && path === "/admin/users") {
      return json(200, await listTenantUsers(user, event.queryStringParameters ?? {}), origin);
    }

    if (method === "POST" && path === "/admin/users") {
      return json(200, await createTenantUser(user, await readJson(event), event), origin);
    }

    if (method === "POST" && path === "/admin/suppliers/onboard") {
      return json(200, await onboardSupplier(user, await readJson(event), event), origin);
    }

    if (method === "POST" && path === "/admin/evidence/expire-stale") {
      return json(200, await expireEvidenceForTenant(user, await readJson(event), event), origin);
    }

    if (method === "GET" && path === "/suppliers") {
      return json(200, await listSuppliers(user, event.queryStringParameters ?? {}), origin);
    }

    if (method === "POST" && path === "/suppliers") {
      return json(200, await createSupplier(user, await readJson(event)), origin);
    }

    if (method === "GET" && path === "/evidence") {
      return json(200, await listEvidence(user, event.queryStringParameters ?? {}), origin);
    }

    if (method === "POST" && path === "/evidence") {
      return json(200, await createEvidence(user, await readJson(event), event), origin);
    }

    const evidenceReview = path.match(/^\/evidence\/([^/]+)\/review$/);
    if (method === "PATCH" && evidenceReview) {
      return json(200, await reviewEvidence(user, evidenceReview[1], await readJson(event), event), origin);
    }

    if (method === "GET" && path === "/work-packages") {
      return json(200, await listWorkPackages(user, event.queryStringParameters ?? {}), origin);
    }

    if (method === "POST" && path === "/work-packages") {
      return json(200, await createWorkPackage(user, await readJson(event), event), origin);
    }

    const classification = path.match(/^\/work-packages\/([^/]+)\/classification$/);
    if (method === "PATCH" && classification) {
      return json(200, await approveClassification(user, classification[1], await readJson(event), event), origin);
    }

    const uploadUrl = path.match(/^\/work-packages\/([^/]+)\/documents\/upload-url$/);
    if (method === "POST" && uploadUrl) {
      return json(200, await createDocumentUploadUrl(user, uploadUrl[1], await readJson(event), event), origin);
    }

    const match = path.match(/^\/work-packages\/([^/]+)\/match$/);
    if (method === "POST" && match) {
      return json(200, await matchWorkPackage(user, match[1], await readJson(event), event), origin);
    }

    if (method === "POST" && path === "/rfqs") {
      return json(200, await createRfq(user, await readJson(event), event), origin);
    }

    const invite = path.match(/^\/rfqs\/([^/]+)\/invites$/);
    if (method === "POST" && invite) {
      return json(200, await createInvite(user, invite[1], await readJson(event), event), origin);
    }

    const revoke = path.match(/^\/invites\/([^/]+)\/revoke$/);
    if (method === "PATCH" && revoke) {
      return json(200, await revokeInvite(user, revoke[1], await readJson(event), event), origin);
    }

    const inviteResponse = path.match(/^\/invites\/([^/]+)\/response$/);
    if (method === "PATCH" && inviteResponse) {
      return json(200, await updateInviteResponse(user, inviteResponse[1], await readJson(event), event), origin);
    }

    const dataRoom = path.match(/^\/data-room\/([^/]+)$/);
    if (method === "GET" && dataRoom) {
      return json(200, await openDataRoom(dataRoom[1], event), origin);
    }

    const dataRoomResponse = path.match(/^\/data-room\/([^/]+)\/respond$/);
    if (method === "POST" && dataRoomResponse) {
      return json(200, await respondToInvite(dataRoomResponse[1], await readJson(event), event), origin);
    }

    if (method === "GET" && path === "/audit/export") {
      return await exportAudit(user, event.queryStringParameters ?? {}, origin);
    }

    throw new ApiError(404, "Route not found.");
  } catch (error) {
    if (error instanceof ApiError) {
      return json(error.statusCode, { detail: error.message }, origin);
    }
    console.error(error);
    return json(500, { detail: "Internal server error." }, origin);
  }
}

async function createAccessRequest(event: APIGatewayProxyEventV2) {
  const payload = await readJson(event);
  requireString(payload.name, "name");
  requireString(payload.email, "email");
  requireString(payload.company, "company");
  requireString(payload.role, "role");
  requireString(payload.use_case, "use_case");
  if (payload.consent_to_contact !== true) {
    throw new ApiError(400, "consent_to_contact must be true.");
  }

  const id = createId("access");
  const createdAt = new Date().toISOString();
  await putItem({
    pk: "ACCESS_REQUESTS",
    sk: `REQUEST#${id}`,
    kind: "accessRequest",
    id,
    name: payload.name,
    email: String(payload.email).toLowerCase(),
    company: payload.company,
    role: payload.role,
    useCase: payload.use_case,
    estimatedMonthlyRfqs: payload.estimated_monthly_rfqs ?? null,
    notes: payload.notes ?? null,
    consentToContact: true,
    status: "new",
    createdAt,
    updatedAt: createdAt,
  });
  await putPublicAudit(
    buildAudit({
      action: "ACCESS_REQUEST_SUBMITTED",
      entityType: "AccessRequest",
      entityId: id,
      metadataJson: { company: payload.company, email: String(payload.email).toLowerCase() },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt,
    }),
  );

  return {
    request_id: id,
    status: "new",
    company: payload.company,
    email: String(payload.email).toLowerCase(),
    next_step: "We will review the request and confirm the right demo or pilot path before enabling production data access.",
  };
}

async function getDashboardState(user: CurrentUser, query: Record<string, string | undefined>) {
  const tenantId = resolveTenantId(user, query.tenant_id);
  const data = await loadTenantData(tenantId);
  return { tenant_id: tenantId, data };
}

async function seedDemoTenant(user: CurrentUser, payload: Record<string, unknown>) {
  requireAnyRole(user, ["PLATFORM_ADMIN", "BUYER_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const createdAt = new Date().toISOString();
  const items: StoredItem[] = [
    ...demoData.organizations.map((item) => tenantItem(tenantId, "organization", `ORG#${item.id}`, item)),
    ...demoData.users.map((item) => tenantItem(tenantId, "user", `USER#${item.id}`, item)),
    ...demoData.facilities.map((item) => tenantItem(tenantId, "facility", `FACILITY#${item.id}`, item)),
    ...demoData.supplierProfiles.map((item) => tenantItem(tenantId, "supplierProfile", `SUPPLIER_PROFILE#${item.id}`, item)),
    ...demoData.capabilities.map((item) => tenantItem(tenantId, "capability", `CAPABILITY#${item.id}`, item)),
    ...demoData.machines.map((item) => tenantItem(tenantId, "machine", `MACHINE#${item.id}`, item)),
    ...demoData.complianceEvidence.map((item) => tenantItem(tenantId, "evidence", `EVIDENCE#${item.id}`, item)),
    ...demoData.registryChecks.map((item) => tenantItem(tenantId, "registryCheck", `REGISTRY#${item.id}`, item)),
    ...demoData.capacitySignals.map((item) => tenantItem(tenantId, "capacitySignal", `CAPACITY#${item.id}`, item)),
    ...demoData.workPackages.map((item) => tenantItem(tenantId, "workPackage", `WORK#${item.id}`, item)),
    ...demoData.documents.map((item) => tenantItem(tenantId, "document", `DOC#${item.id}`, item)),
    ...demoData.rfqs.map((item) => tenantItem(tenantId, "rfq", `RFQ#${item.id}`, item)),
    ...demoData.rfqInvites.map((item) => ({
      ...tenantItem(tenantId, "invite", `INVITE#${item.id}`, item),
      gsi1pk: `TOKEN#${item.secureTokenHash}`,
      gsi1sk: `INVITE#${item.id}`,
    })),
    ...demoData.auditLogs.map((item) => tenantAuditItem(tenantId, item)),
  ];

  await batchPut(items);
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "DEMO_TENANT_SEEDED",
      entityType: "Tenant",
      entityId: tenantId,
      metadataJson: { itemCount: items.length },
      createdAt,
    }),
  );
  return { tenant_id: tenantId, seeded_items: items.length };
}

async function listBuyerOrgs(user: CurrentUser, query: Record<string, string | undefined>) {
  requireAnyRole(user, ["BUYER_ADMIN", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, query.tenant_id);
  const data = await loadTenantData(tenantId);
  return {
    buyer_orgs: data.organizations.filter((org) => org.type === "BUYER"),
  };
}

async function createBuyerOrg(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "PLATFORM_ADMIN"]);
  const requestedTenantId = stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId);
  const tenantId = resolveTenantId(user, requestedTenantId);
  const now = new Date().toISOString();
  const orgPayload = objectOrEmpty(payload.organization);
  const org: Organization = {
    id: stringOrUndefined(orgPayload.id) ?? tenantId,
    name: requireString(orgPayload.name ?? payload.name, "organization.name"),
    type: "BUYER",
    cageCode: stringOrUndefined(orgPayload.cageCode ?? orgPayload.cage_code ?? payload.cageCode),
    uei: stringOrUndefined(orgPayload.uei ?? payload.uei),
    country: stringOrUndefined(orgPayload.country ?? payload.country) ?? "US",
    state: stringOrUndefined(orgPayload.state ?? payload.state),
    createdAt: now,
    updatedAt: now,
  };
  await putItem(tenantItem(tenantId, "organization", `ORG#${org.id}`, org));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "BUYER_ORG_CREATED",
      entityType: "Organization",
      entityId: org.id,
      metadataJson: { name: org.name },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt: now,
    }),
  );
  return { buyer_org: org };
}

async function listTenantUsers(user: CurrentUser, query: Record<string, string | undefined>) {
  requireAnyRole(user, ["BUYER_ADMIN", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, query.tenant_id);
  const data = await loadTenantData(tenantId);
  return { users: data.users };
}

async function createTenantUser(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const role = requireString(payload.role, "role") as UserRole;
  if (
    ![
      "BUYER_ADMIN",
      "BUYER_PROCUREMENT",
      "SUPPLIER_ADMIN",
      "SUPPLIER_ESTIMATOR",
      "COMPLIANCE_REVIEWER",
      "PLATFORM_ADMIN",
    ].includes(role)
  ) {
    throw new ApiError(400, "Invalid role.");
  }
  const now = new Date().toISOString();
  const appUser: User = {
    id: stringOrUndefined(payload.id) ?? createId("user"),
    organizationId: requireString(payload.organizationId ?? payload.organization_id, "organization_id"),
    name: requireString(payload.name, "name"),
    email: requireString(payload.email, "email").toLowerCase(),
    role,
    createdAt: now,
  };
  await putItem(tenantItem(tenantId, "user", `USER#${appUser.id}`, appUser));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "TENANT_USER_CREATED",
      entityType: "User",
      entityId: appUser.id,
      metadataJson: { email: appUser.email, role },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt: now,
    }),
  );
  return {
    user: appUser,
    note: "Cognito account creation remains an administrator action; this endpoint stores the application user profile.",
  };
}

async function onboardSupplier(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const now = new Date().toISOString();
  const orgPayload = objectOrEmpty(payload.organization);
  const supplierOrg: Organization = {
    id: stringOrUndefined(orgPayload.id) ?? createId("supplier"),
    name: requireString(orgPayload.name ?? payload.name, "organization.name"),
    type: "SUPPLIER",
    cageCode: stringOrUndefined(orgPayload.cageCode ?? orgPayload.cage_code),
    uei: stringOrUndefined(orgPayload.uei),
    country: stringOrUndefined(orgPayload.country) ?? "US",
    state: stringOrUndefined(orgPayload.state),
    createdAt: now,
    updatedAt: now,
  };

  const profilePayload = objectOrEmpty(payload.profile);
  const profile: SupplierProfile = {
    id: stringOrUndefined(profilePayload.id) ?? createId("profile"),
    supplierOrgId: supplierOrg.id,
    lifecycleStage: (stringOrUndefined(profilePayload.lifecycleStage ?? profilePayload.lifecycle_stage) ?? "DEVELOPMENTAL") as SupplierProfile["lifecycleStage"],
    summary: requireString(profilePayload.summary ?? payload.summary, "profile.summary"),
    website: stringOrUndefined(profilePayload.website),
    primaryContact: requireString(profilePayload.primaryContact ?? profilePayload.primary_contact, "profile.primary_contact"),
    status: (stringOrUndefined(profilePayload.status) ?? "NEEDS_REVIEW") as SupplierProfile["status"],
  };

  const facilityPayload = objectOrEmpty(payload.facility);
  const facility: Facility = {
    id: stringOrUndefined(facilityPayload.id) ?? createId("facility"),
    supplierOrgId: supplierOrg.id,
    name: requireString(facilityPayload.name, "facility.name"),
    address: requireString(facilityPayload.address, "facility.address"),
    country: stringOrUndefined(facilityPayload.country) ?? supplierOrg.country,
    state: stringOrUndefined(facilityPayload.state) ?? supplierOrg.state,
    cageCode: stringOrUndefined(facilityPayload.cageCode ?? facilityPayload.cage_code) ?? supplierOrg.cageCode,
    isActive: facilityPayload.isActive === undefined ? true : Boolean(facilityPayload.isActive),
  };

  const capabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities.map((candidate) => {
        const capabilityPayload = objectOrEmpty(candidate);
        const capability: Capability = {
          id: stringOrUndefined(capabilityPayload.id) ?? createId("capability"),
          facilityId: stringOrUndefined(capabilityPayload.facilityId ?? capabilityPayload.facility_id) ?? facility.id,
          processType: requireString(capabilityPayload.processType ?? capabilityPayload.process_type, "capabilities.process_type") as Capability["processType"],
          materials: stringArray(capabilityPayload.materials),
          toleranceMinInches: Number(capabilityPayload.toleranceMinInches ?? capabilityPayload.tolerance_min_inches ?? 0.005),
          maxPartSize: stringOrUndefined(capabilityPayload.maxPartSize ?? capabilityPayload.max_part_size) ?? "requires review",
          quantityMin: Number(capabilityPayload.quantityMin ?? capabilityPayload.quantity_min ?? 1),
          quantityMax: Number(capabilityPayload.quantityMax ?? capabilityPayload.quantity_max ?? 1),
          inspectionCapabilities: stringArray(capabilityPayload.inspectionCapabilities ?? capabilityPayload.inspection_capabilities),
          notes: stringOrUndefined(capabilityPayload.notes),
        };
        return capability;
      })
    : [];

  const evidence = Array.isArray(payload.evidence)
    ? payload.evidence.map((candidate) => {
        const evidencePayload = objectOrEmpty(candidate);
        const record: ComplianceEvidence = {
          id: stringOrUndefined(evidencePayload.id) ?? createId("evidence"),
          supplierOrgId: supplierOrg.id,
          facilityId: stringOrUndefined(evidencePayload.facilityId ?? evidencePayload.facility_id) ?? facility.id,
          type: requireString(evidencePayload.type, "evidence.type") as ComplianceEvidence["type"],
          status: (stringOrUndefined(evidencePayload.status) ?? "PENDING_REVIEW") as ComplianceEvidence["status"],
          source: (stringOrUndefined(evidencePayload.source) ?? "SUPPLIER_UPLOAD") as ComplianceEvidence["source"],
          scopeText: requireString(evidencePayload.scopeText ?? evidencePayload.scope_text, "evidence.scope_text"),
          certificateNumber: stringOrUndefined(evidencePayload.certificateNumber ?? evidencePayload.certificate_number),
          issuingBody: stringOrUndefined(evidencePayload.issuingBody ?? evidencePayload.issuing_body),
          issueDate: stringOrUndefined(evidencePayload.issueDate ?? evidencePayload.issue_date),
          expirationDate: stringOrUndefined(evidencePayload.expirationDate ?? evidencePayload.expiration_date),
          reviewedBy: stringOrUndefined(evidencePayload.reviewedBy ?? evidencePayload.reviewed_by),
          reviewedAt: stringOrUndefined(evidencePayload.reviewedAt ?? evidencePayload.reviewed_at),
          notes: stringOrUndefined(evidencePayload.notes),
          fileUrl: stringOrUndefined(evidencePayload.fileUrl ?? evidencePayload.file_url),
        };
        return record;
      })
    : [];

  await batchPut([
    tenantItem(tenantId, "organization", `ORG#${supplierOrg.id}`, supplierOrg),
    tenantItem(tenantId, "supplierProfile", `SUPPLIER_PROFILE#${profile.id}`, profile),
    tenantItem(tenantId, "facility", `FACILITY#${facility.id}`, facility),
    ...capabilities.map((capability) => tenantItem(tenantId, "capability", `CAPABILITY#${capability.id}`, capability)),
    ...evidence.map((record) => tenantItem(tenantId, "evidence", `EVIDENCE#${record.id}`, record)),
  ]);
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "SUPPLIER_ONBOARDED",
      entityType: "Organization",
      entityId: supplierOrg.id,
      metadataJson: {
        capabilityCount: capabilities.length,
        evidenceCount: evidence.length,
        status: profile.status,
      },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt: now,
    }),
  );

  return {
    supplier: supplierOrg,
    profile,
    facility,
    capabilities,
    evidence,
  };
}

async function expireEvidenceForTenant(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const items = (await queryByPk(`TENANT#${tenantId}`)).filter((item) => item.kind === "evidence");
  const result = await applyEvidenceExpirationItems(items, new Date(), {
    actorUserId: user.userId,
    orgId: user.tenantId,
    ipAddress: event.requestContext.http.sourceIp,
  });
  return {
    tenant_id: tenantId,
    checked: result.checked,
    updated: result.updated,
  };
}

async function expireEvidenceForAllTenants(now: Date) {
  const items = await scanByKind("evidence");
  const result = await applyEvidenceExpirationItems(items, now, {});
  return {
    status: "ok",
    checked: result.checked,
    updated: result.updated,
  };
}

async function applyEvidenceExpirationItems(
  items: StoredItem[],
  now: Date,
  auditContext: { actorUserId?: string; orgId?: string; ipAddress?: string },
) {
  let updated = 0;
  for (const item of items) {
    const tenantId = stringOrUndefined(item.tenantId);
    const evidence = cleanItem<ComplianceEvidence>(item);
    if (!tenantId || !evidence.id) {
      continue;
    }
    const expiration = evaluateEvidenceExpiration(evidence, now);
    if (!expiration) {
      continue;
    }
    const nextEvidence: ComplianceEvidence = {
      ...evidence,
      status: expiration.status,
      notes: expiration.reason,
    };
    await putItem(tenantItem(tenantId, "evidence", `EVIDENCE#${nextEvidence.id}`, nextEvidence));
    await putTenantAudit(
      tenantId,
      buildAudit({
        tenantId,
        actorUserId: auditContext.actorUserId,
        orgId: auditContext.orgId,
        action: "EVIDENCE_EXPIRATION_UPDATED",
        entityType: "ComplianceEvidence",
        entityId: nextEvidence.id,
        metadataJson: {
          supplierOrgId: nextEvidence.supplierOrgId,
          status: nextEvidence.status,
          expirationDate: nextEvidence.expirationDate,
          reason: expiration.reason,
        },
        ipAddress: auditContext.ipAddress,
        createdAt: now.toISOString(),
      }),
    );
    updated += 1;
  }
  return { checked: items.length, updated };
}

async function listSuppliers(user: CurrentUser, query: Record<string, string | undefined>) {
  const tenantId = resolveTenantId(user, query.tenant_id);
  const data = await loadTenantData(tenantId);
  return {
    suppliers: data.organizations
      .filter((org) => org.type === "SUPPLIER")
      .map((org) => ({
        ...org,
        profile: data.supplierProfiles.find((profile) => profile.supplierOrgId === org.id),
        facilities: data.facilities.filter((facility) => facility.supplierOrgId === org.id),
        evidence: data.complianceEvidence.filter((evidence) => evidence.supplierOrgId === org.id),
      })),
  };
}

async function createSupplier(user: CurrentUser, payload: Record<string, unknown>) {
  requireAnyRole(user, ["BUYER_ADMIN", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const now = new Date().toISOString();
  const org = objectOrEmpty(payload.organization);
  const supplierOrg: Organization = {
    id: stringOrUndefined(org.id) ?? createId("supplier"),
    name: requireString(org.name, "organization.name"),
    type: "SUPPLIER",
    cageCode: stringOrUndefined(org.cageCode),
    uei: stringOrUndefined(org.uei),
    country: stringOrUndefined(org.country) ?? "US",
    state: stringOrUndefined(org.state),
    createdAt: now,
    updatedAt: now,
  };
  await putItem(tenantItem(tenantId, "organization", `ORG#${supplierOrg.id}`, supplierOrg));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "SUPPLIER_CREATED",
      entityType: "Organization",
      entityId: supplierOrg.id,
      metadataJson: { name: supplierOrg.name },
      createdAt: now,
    }),
  );
  return { supplier: supplierOrg };
}

async function listEvidence(user: CurrentUser, query: Record<string, string | undefined>) {
  const tenantId = resolveTenantId(user, query.tenant_id);
  const data = await loadTenantData(tenantId);
  return {
    evidence: data.complianceEvidence.filter((item) =>
      query.supplier_org_id ? item.supplierOrgId === query.supplier_org_id : true,
    ),
  };
}

async function createEvidence(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN", "SUPPLIER_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const now = new Date().toISOString();
  const evidence: ComplianceEvidence = {
    id: stringOrUndefined(payload.id) ?? createId("evidence"),
    supplierOrgId: requireString(payload.supplierOrgId ?? payload.supplier_org_id, "supplier_org_id"),
    facilityId: stringOrUndefined(payload.facilityId ?? payload.facility_id),
    type: requireString(payload.type, "type") as ComplianceEvidence["type"],
    status: (stringOrUndefined(payload.status) ?? "PENDING_REVIEW") as ComplianceEvidence["status"],
    source: (stringOrUndefined(payload.source) ?? "SUPPLIER_UPLOAD") as ComplianceEvidence["source"],
    scopeText: requireString(payload.scopeText ?? payload.scope_text, "scope_text"),
    certificateNumber: stringOrUndefined(payload.certificateNumber ?? payload.certificate_number),
    issuingBody: stringOrUndefined(payload.issuingBody ?? payload.issuing_body),
    issueDate: stringOrUndefined(payload.issueDate ?? payload.issue_date),
    expirationDate: stringOrUndefined(payload.expirationDate ?? payload.expiration_date),
    reviewedBy: stringOrUndefined(payload.reviewedBy ?? payload.reviewed_by),
    reviewedAt: stringOrUndefined(payload.reviewedAt ?? payload.reviewed_at),
    notes: stringOrUndefined(payload.notes),
    fileUrl: stringOrUndefined(payload.fileUrl ?? payload.file_url),
  };
  await putItem(tenantItem(tenantId, "evidence", `EVIDENCE#${evidence.id}`, evidence));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "EVIDENCE_CREATED",
      entityType: "ComplianceEvidence",
      entityId: evidence.id,
      metadataJson: { supplierOrgId: evidence.supplierOrgId, status: evidence.status },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt: now,
    }),
  );
  return { evidence };
}

async function reviewEvidence(user: CurrentUser, evidenceId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, reviewerRoles);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const existing = await getTenantItem<ComplianceEvidence>(tenantId, `EVIDENCE#${evidenceId}`);
  if (!existing) {
    throw new ApiError(404, "Evidence not found.");
  }
  const reviewed: ComplianceEvidence = {
    ...existing,
    status: requireString(payload.status, "status") as ComplianceEvidence["status"],
    reviewedBy: user.email ?? user.userId,
    reviewedAt: new Date().toISOString(),
    expirationDate: stringOrUndefined(payload.expirationDate ?? payload.expiration_date) ?? existing.expirationDate,
    notes: stringOrUndefined(payload.notes) ?? existing.notes,
  };
  await putItem(tenantItem(tenantId, "evidence", `EVIDENCE#${evidenceId}`, reviewed));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "EVIDENCE_REVIEWED",
      entityType: "ComplianceEvidence",
      entityId: evidenceId,
      metadataJson: { status: reviewed.status },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { evidence: reviewed };
}

async function listWorkPackages(user: CurrentUser, query: Record<string, string | undefined>) {
  const tenantId = resolveTenantId(user, query.tenant_id);
  const data = await loadTenantData(tenantId);
  return { work_packages: data.workPackages };
}

async function createWorkPackage(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, buyerWriteRoles);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const now = new Date().toISOString();
  const workPackage: WorkPackage = {
    id: stringOrUndefined(payload.id) ?? createId("work"),
    buyerOrgId: stringOrUndefined(payload.buyerOrgId ?? payload.buyer_org_id) ?? tenantId,
    title: requireString(payload.title, "title"),
    description: requireString(payload.description, "description"),
    dataClassification: (stringOrUndefined(payload.dataClassification ?? payload.data_classification) ?? "UNKNOWN") as WorkPackage["dataClassification"],
    classificationApprovedBy: stringOrUndefined(payload.classificationApprovedBy ?? payload.classification_approved_by),
    classificationApprovedAt: stringOrUndefined(payload.classificationApprovedAt ?? payload.classification_approved_at),
    requiredCompliance: stringArray(payload.requiredCompliance ?? payload.required_compliance) as WorkPackage["requiredCompliance"],
    requiredProcesses: stringArray(payload.requiredProcesses ?? payload.required_processes) as WorkPackage["requiredProcesses"],
    requiredMaterials: stringArray(payload.requiredMaterials ?? payload.required_materials),
    requiredInspection: stringArray(payload.requiredInspection ?? payload.required_inspection),
    toleranceRequiredInches: numberOrUndefined(payload.toleranceRequiredInches ?? payload.tolerance_required_inches),
    quantity: Number(payload.quantity ?? 1),
    dueDate: requireString(payload.dueDate ?? payload.due_date, "due_date"),
    lifecycleStageTarget: (stringOrUndefined(payload.lifecycleStageTarget ?? payload.lifecycle_stage_target) ?? "SCALING") as WorkPackage["lifecycleStageTarget"],
    status: "CLASSIFICATION_REVIEW",
  };
  await putItem(tenantItem(tenantId, "workPackage", `WORK#${workPackage.id}`, workPackage));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "WORK_PACKAGE_CREATED",
      entityType: "WorkPackage",
      entityId: workPackage.id,
      metadataJson: { classification: workPackage.dataClassification },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt: now,
    }),
  );
  return { work_package: workPackage };
}

async function approveClassification(user: CurrentUser, workPackageId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const existing = await getTenantItem<WorkPackage>(tenantId, `WORK#${workPackageId}`);
  if (!existing) {
    throw new ApiError(404, "Work package not found.");
  }
  const updated: WorkPackage = {
    ...existing,
    dataClassification: (stringOrUndefined(payload.dataClassification ?? payload.data_classification) ?? existing.dataClassification) as WorkPackage["dataClassification"],
    classificationApprovedBy: user.email ?? user.userId,
    classificationApprovedAt: new Date().toISOString(),
    status: "READY_TO_MATCH",
  };
  await putItem(tenantItem(tenantId, "workPackage", `WORK#${workPackageId}`, updated));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "CLASSIFICATION_APPROVED",
      entityType: "WorkPackage",
      entityId: workPackageId,
      metadataJson: { classification: updated.dataClassification },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { work_package: updated };
}

async function createDocumentUploadUrl(user: CurrentUser, workPackageId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, buyerWriteRoles);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const workPackage = await getTenantItem<WorkPackage>(tenantId, `WORK#${workPackageId}`);
  if (!workPackage) {
    throw new ApiError(404, "Work package not found.");
  }
  const id = createId("doc");
  const filename = requireString(payload.filename, "filename").replaceAll("/", "_");
  const contentType = stringOrUndefined(payload.contentType ?? payload.content_type) ?? "application/octet-stream";
  const storageKey = `${tenantId}/${workPackageId}/${id}/${filename}`;
  const document: DocumentRecord = {
    id,
    workPackageId,
    filename,
    storageKey,
    contentType,
    sizeBytes: Number(payload.sizeBytes ?? payload.size_bytes ?? 0),
    checksum: stringOrUndefined(payload.checksum) ?? "pending",
    classification: (stringOrUndefined(payload.classification) ?? workPackage.dataClassification) as DocumentRecord["classification"],
    uploadedBy: user.userId,
    createdAt: new Date().toISOString(),
  };
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: documentBucket,
      Key: storageKey,
      ContentType: contentType,
      Metadata: {
        tenant_id: tenantId,
        work_package_id: workPackageId,
        uploaded_by: user.userId,
      },
    }),
    { expiresIn: 900 },
  );
  await putItem(tenantItem(tenantId, "document", `DOC#${id}`, document));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "DOCUMENT_UPLOAD_URL_CREATED",
      entityType: "Document",
      entityId: id,
      metadataJson: { workPackageId, classification: document.classification },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { document, upload_url: uploadUrl, expires_in_seconds: 900 };
}

async function matchWorkPackage(user: CurrentUser, workPackageId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["BUYER_ADMIN", "BUYER_PROCUREMENT", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const data = await loadTenantData(tenantId);
  const workPackage = data.workPackages.find((candidate) => candidate.id === workPackageId);
  if (!workPackage) {
    throw new ApiError(404, "Work package not found.");
  }
  const matches = runTenantMatching({
    workPackage,
    organizations: data.organizations,
    facilities: data.facilities,
    supplierProfiles: data.supplierProfiles,
    capabilities: data.capabilities,
    complianceEvidence: data.complianceEvidence,
    capacitySignals: data.capacitySignals,
    now: new Date(),
  });
  await batchPut(
    matches.map((match) =>
      tenantItem(tenantId, "supplierMatch", `MATCH#${workPackageId}#${match.supplierOrgId}#${match.facilityId}`, match),
    ),
  );
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "MATCHING_RUN",
      entityType: "WorkPackage",
      entityId: workPackageId,
      metadataJson: {
        eligible: matches.filter((match) => match.eligibilityStatus === "ELIGIBLE").length,
        manualReview: matches.filter((match) => match.eligibilityStatus === "MANUAL_REVIEW").length,
        ineligible: matches.filter((match) => match.eligibilityStatus === "INELIGIBLE").length,
      },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { matches };
}

async function createRfq(user: CurrentUser, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, buyerWriteRoles);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const workPackageId = requireString(payload.workPackageId ?? payload.work_package_id, "work_package_id");
  const workPackage = await getTenantItem<WorkPackage>(tenantId, `WORK#${workPackageId}`);
  if (!workPackage) {
    throw new ApiError(404, "Work package not found.");
  }
  const now = new Date().toISOString();
  const rfq: RFQ = {
    id: createId("rfq"),
    workPackageId,
    buyerOrgId: workPackage.buyerOrgId,
    status: "DRAFT",
    createdAt: now,
  };
  await putItem(tenantItem(tenantId, "rfq", `RFQ#${rfq.id}`, rfq));
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "RFQ_CREATED",
      entityType: "RFQ",
      entityId: rfq.id,
      metadataJson: { workPackageId },
      ipAddress: event.requestContext.http.sourceIp,
      createdAt: now,
    }),
  );
  return { rfq };
}

async function createInvite(user: CurrentUser, rfqId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, buyerWriteRoles);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const rfq = await getTenantItem<RFQ>(tenantId, `RFQ#${rfqId}`);
  if (!rfq) {
    throw new ApiError(404, "RFQ not found.");
  }
  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresInDays = Number(payload.expiresInDays ?? payload.expires_in_days ?? 14);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const invite: RFQInvite = {
    id: createId("invite"),
    rfqId,
    workPackageId: rfq.workPackageId,
    supplierOrgId: requireString(payload.supplierOrgId ?? payload.supplier_org_id, "supplier_org_id"),
    facilityId: requireString(payload.facilityId ?? payload.facility_id, "facility_id"),
    accessStatus: "RELEASED",
    secureTokenHash: tokenHash,
    expiresAt,
    sentAt: new Date().toISOString(),
    responseStatus: "PENDING",
  };
  await putItem({
    ...tenantItem(tenantId, "invite", `INVITE#${invite.id}`, invite),
    gsi1pk: `TOKEN#${tokenHash}`,
    gsi1sk: `INVITE#${invite.id}`,
  });
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "RFQ_INVITE_RELEASED",
      entityType: "RFQInvite",
      entityId: invite.id,
      metadataJson: { rfqId, supplierOrgId: invite.supplierOrgId, expiresAt },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return {
    invite: { ...invite, secureTokenHash: "stored-server-side" },
    data_room_url: `${apiBaseUrl(event)}/data-room/${token}`,
    token_once: token,
  };
}

async function revokeInvite(user: CurrentUser, inviteId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, buyerWriteRoles);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const invite = await getTenantItem<RFQInvite>(tenantId, `INVITE#${inviteId}`);
  if (!invite) {
    throw new ApiError(404, "Invite not found.");
  }
  const updated = { ...invite, accessStatus: "REVOKED" as const };
  await putItem({
    ...tenantItem(tenantId, "invite", `INVITE#${inviteId}`, updated),
    gsi1pk: `TOKEN#${updated.secureTokenHash}`,
    gsi1sk: `INVITE#${inviteId}`,
  });
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "RFQ_INVITE_REVOKED",
      entityType: "RFQInvite",
      entityId: inviteId,
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { invite: { ...updated, secureTokenHash: "stored-server-side" } };
}

async function updateInviteResponse(user: CurrentUser, inviteId: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  requireAnyRole(user, ["SUPPLIER_ADMIN", "SUPPLIER_ESTIMATOR", "PLATFORM_ADMIN"]);
  const tenantId = resolveTenantId(user, stringOrUndefined(payload.tenant_id) ?? stringOrUndefined(payload.tenantId));
  const invite = await getTenantItem<RFQInvite>(tenantId, `INVITE#${inviteId}`);
  if (!invite) {
    throw new ApiError(404, "Invite not found.");
  }
  const responseStatus = requireString(payload.responseStatus ?? payload.response_status, "response_status") as RFQInvite["responseStatus"];
  if (!["QUOTED", "DECLINED", "NO_BID"].includes(responseStatus)) {
    throw new ApiError(400, "response_status must be QUOTED, DECLINED, or NO_BID.");
  }
  const updated: RFQInvite = {
    ...invite,
    responseStatus,
    noBidReason: stringOrUndefined(payload.noBidReason ?? payload.no_bid_reason),
    quotedLeadTimeDays: numberOrUndefined(payload.quotedLeadTimeDays ?? payload.quoted_lead_time_days),
    quoteAmount: numberOrUndefined(payload.quoteAmount ?? payload.quote_amount),
    viewedAt: invite.viewedAt ?? new Date().toISOString(),
  };
  await putItem({
    ...tenantItem(tenantId, "invite", `INVITE#${inviteId}`, updated),
    gsi1pk: `TOKEN#${updated.secureTokenHash}`,
    gsi1sk: `INVITE#${inviteId}`,
  });
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      actorUserId: user.userId,
      orgId: user.tenantId,
      action: "SUPPLIER_RESPONSE_LOGGED",
      entityType: "RFQInvite",
      entityId: updated.id,
      metadataJson: { responseStatus, quoteAmount: updated.quoteAmount, noBidReason: updated.noBidReason },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { invite: { ...updated, secureTokenHash: "stored-server-side" } };
}

async function openDataRoom(token: string, event: APIGatewayProxyEventV2) {
  const invite = await inviteByToken(token);
  const tenantId = requireString(invite.tenantId, "tenantId");
  const data = await loadTenantData(tenantId);
  const workPackage = data.workPackages.find((candidate) => candidate.id === invite.workPackageId);
  if (!workPackage) {
    throw new ApiError(404, "Work package not found.");
  }
  const decision = evaluateDataRoomAccess({
    invite,
    workPackage,
    documents: data.documents,
    evidence: data.complianceEvidence,
    now: new Date(),
  });
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      action: decision.allowed ? "DATA_ROOM_OPENED" : "DATA_ROOM_ACCESS_DENIED",
      entityType: "RFQInvite",
      entityId: invite.id,
      metadataJson: { reason: decision.reason, supplierOrgId: invite.supplierOrgId },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );

  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason };
  }

  const documents = await Promise.all(
    decision.documents.map(async (document) => ({
      id: document.id,
      filename: document.filename,
      content_type: document.contentType,
      classification: document.classification,
      expires_in_seconds: 900,
      signed_url: await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: documentBucket,
          Key: document.storageKey,
          ResponseContentDisposition: `attachment; filename="${document.filename}"`,
        }),
        { expiresIn: 900 },
      ),
    })),
  );

  return {
    allowed: true,
    reason: decision.reason,
    work_package: {
      id: workPackage.id,
      title: workPackage.title,
      data_classification: workPackage.dataClassification,
      quantity: workPackage.quantity,
      due_date: workPackage.dueDate,
    },
    documents,
  };
}

async function respondToInvite(token: string, payload: Record<string, unknown>, event: APIGatewayProxyEventV2) {
  const invite = await inviteByToken(token);
  const tenantId = requireString(invite.tenantId, "tenantId");
  const responseStatus = requireString(payload.responseStatus ?? payload.response_status, "response_status") as RFQInvite["responseStatus"];
  if (!["QUOTED", "DECLINED", "NO_BID"].includes(responseStatus)) {
    throw new ApiError(400, "response_status must be QUOTED, DECLINED, or NO_BID.");
  }
  const updated: RFQInvite = {
    ...invite,
    responseStatus,
    noBidReason: stringOrUndefined(payload.noBidReason ?? payload.no_bid_reason),
    quotedLeadTimeDays: numberOrUndefined(payload.quotedLeadTimeDays ?? payload.quoted_lead_time_days),
    quoteAmount: numberOrUndefined(payload.quoteAmount ?? payload.quote_amount),
    viewedAt: invite.viewedAt ?? new Date().toISOString(),
  };
  await putItem({
    ...tenantItem(tenantId, "invite", `INVITE#${updated.id}`, updated),
    gsi1pk: `TOKEN#${updated.secureTokenHash}`,
    gsi1sk: `INVITE#${updated.id}`,
  });
  await putTenantAudit(
    tenantId,
    buildAudit({
      tenantId,
      action: "SUPPLIER_RESPONSE_SUBMITTED",
      entityType: "RFQInvite",
      entityId: updated.id,
      metadataJson: { responseStatus, quoteAmount: updated.quoteAmount },
      ipAddress: event.requestContext.http.sourceIp,
    }),
  );
  return { invite: { ...updated, secureTokenHash: "stored-server-side" } };
}

async function exportAudit(user: CurrentUser, query: Record<string, string | undefined>, origin?: string) {
  const tenantId = resolveTenantId(user, query.tenant_id);
  requireAnyRole(user, ["BUYER_ADMIN", "BUYER_PROCUREMENT", "COMPLIANCE_REVIEWER", "PLATFORM_ADMIN"]);
  const items = await queryByPk(`TENANT#${tenantId}`);
  const audit = items
    .filter((item) => item.kind === "audit")
    .map(cleanItem<AuditLog>)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (query.format === "text") {
    const lines = audit.map(
      (item) =>
        `${item.createdAt} | ${item.actorUserId ?? "system"} | ${item.action} | ${item.entityType} ${item.entityId} | ${JSON.stringify(item.metadataJson)}`,
    );
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(origin),
        "content-type": "text/plain; charset=utf-8",
      },
      body: `Who saw what, when, and why\n${lines.join("\n")}`,
    };
  }

  return json(200, { audit }, origin);
}

async function authenticate(event: APIGatewayProxyEventV2): Promise<CurrentUser> {
  if (allowDevAuth && event.headers["x-dev-user-id"]) {
    return {
      userId: event.headers["x-dev-user-id"],
      email: event.headers["x-dev-email"],
      tenantId: event.headers["x-dev-tenant-id"],
      roles: (event.headers["x-dev-roles"] ?? "BUYER_ADMIN")
        .split(",")
        .map((role) => role.trim() as UserRole),
    };
  }

  const header = event.headers.authorization ?? event.headers.Authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing bearer token.");
  }
  return verifyCognitoJwt(header.slice("Bearer ".length));
}

async function verifyCognitoJwt(token: string): Promise<CurrentUser> {
  if (!cognitoIssuer || !cognitoClientId) {
    throw new ApiError(500, "Cognito issuer/client id is not configured.");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new ApiError(401, "Invalid JWT.");
  }
  const header = JSON.parse(base64urlToString(encodedHeader)) as { kid?: string; alg?: string };
  const payload = JSON.parse(base64urlToString(encodedPayload)) as Record<string, unknown>;
  if (header.alg !== "RS256" || !header.kid) {
    throw new ApiError(401, "Unsupported JWT algorithm.");
  }
  if (payload.iss !== cognitoIssuer) {
    throw new ApiError(401, "Invalid token issuer.");
  }
  const audience = payload.aud ?? payload.client_id;
  if (audience !== cognitoClientId) {
    throw new ApiError(401, "Invalid token audience.");
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    throw new ApiError(401, "Token expired.");
  }

  const jwk = (await jwks()).find((candidate) => (candidate as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!jwk) {
    throw new ApiError(401, "JWT signing key not found.");
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64urlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) {
    throw new ApiError(401, "JWT signature verification failed.");
  }

  const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : [];
  return {
    userId: requireString(payload.sub, "sub"),
    email: stringOrUndefined(payload.email),
    tenantId: stringOrUndefined(payload["custom:tenant_id"] ?? payload.tenant_id),
    roles: groups.map((role) => String(role) as UserRole),
  };
}

async function jwks() {
  if (jwksCache) {
    return jwksCache;
  }
  const response = await fetch(`${cognitoIssuer}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new ApiError(500, "Unable to fetch Cognito JWKS.");
  }
  const body = (await response.json()) as { keys: JsonWebKey[] };
  jwksCache = body.keys;
  return jwksCache;
}

async function inviteByToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: marshall({ ":pk": `TOKEN#${tokenHash}` }),
      Limit: 1,
    }),
  );
  const item = result.Items?.[0] ? (unmarshall(result.Items[0]) as StoredItem) : undefined;
  if (!item || item.kind !== "invite") {
    throw new ApiError(404, "Invite token not found.");
  }
  const invite = cleanItem<RFQInvite>(item);
  return { ...invite, tenantId: item.tenantId };
}

async function loadTenantData(tenantId: string) {
  const items = await queryByPk(`TENANT#${tenantId}`);
  return {
    organizations: cleanByKind<Organization>(items, "organization"),
    users: cleanByKind<User>(items, "user"),
    facilities: cleanByKind<Facility>(items, "facility"),
    supplierProfiles: cleanByKind<SupplierProfile>(items, "supplierProfile"),
    capabilities: cleanByKind<Capability>(items, "capability"),
    machines: cleanByKind<Machine>(items, "machine"),
    complianceEvidence: cleanByKind<ComplianceEvidence>(items, "evidence"),
    registryChecks: cleanByKind<RegistryCheck>(items, "registryCheck"),
    capacitySignals: cleanByKind<CapacitySignal>(items, "capacitySignal"),
    workPackages: cleanByKind<WorkPackage>(items, "workPackage"),
    documents: cleanByKind<DocumentRecord>(items, "document"),
    rfqs: cleanByKind<RFQ>(items, "rfq"),
    rfqInvites: cleanByKind<RFQInvite>(items, "invite"),
    supplierMatches: cleanByKind<SupplierMatch>(items, "supplierMatch"),
    auditLogs: cleanByKind<AuditLog>(items, "audit"),
  };
}

async function getTenantItem<T>(tenantId: string, sk: string) {
  const item = await getItem(`TENANT#${tenantId}`, sk);
  return item ? cleanItem<T>(item) : undefined;
}

async function getItem(pk: string, sk: string) {
  const result = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: marshall({ pk, sk }),
    }),
  );
  return result.Item ? (unmarshall(result.Item) as StoredItem) : undefined;
}

async function queryByPk(pk: string) {
  const items: StoredItem[] = [];
  let ExclusiveStartKey: Record<string, never> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: marshall({ ":pk": pk }),
        ExclusiveStartKey,
      }),
    );
    items.push(...(result.Items ?? []).map((item) => unmarshall(item) as StoredItem));
    ExclusiveStartKey = result.LastEvaluatedKey as Record<string, never> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

async function scanByKind(kind: string) {
  const items: StoredItem[] = [];
  let ExclusiveStartKey: Record<string, never> | undefined;
  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "#kind = :kind",
        ExpressionAttributeNames: { "#kind": "kind" },
        ExpressionAttributeValues: marshall({ ":kind": kind }),
        ExclusiveStartKey,
      }),
    );
    items.push(...(result.Items ?? []).map((item) => unmarshall(item) as StoredItem));
    ExclusiveStartKey = result.LastEvaluatedKey as Record<string, never> | undefined;
  } while (ExclusiveStartKey);
  return items;
}

async function putItem(item: StoredItem) {
  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    }),
  );
}

async function batchPut(items: StoredItem[]) {
  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);
    await ddb.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) },
          })),
        },
      }),
    );
  }
}

async function putTenantAudit(tenantId: string, audit: AuditLog) {
  await putItem(tenantAuditItem(tenantId, audit));
}

async function putPublicAudit(audit: AuditLog) {
  await putItem({
    pk: "PUBLIC_AUDIT",
    sk: `AUDIT#${audit.createdAt}#${audit.id}`,
    kind: "audit",
    ...audit,
  });
}

function tenantItem<T extends object>(tenantId: string, kind: string, sk: string, item: T): StoredItem {
  return {
    pk: `TENANT#${tenantId}`,
    sk,
    kind,
    tenantId,
    ...(item as Record<string, unknown>),
  };
}

function tenantAuditItem(tenantId: string, audit: AuditLog): StoredItem {
  return tenantItem(tenantId, "audit", `AUDIT#${audit.createdAt}#${audit.id}`, audit);
}

function cleanByKind<T>(items: StoredItem[], kind: string) {
  return items.filter((item) => item.kind === kind).map(cleanItem<T>);
}

function cleanItem<T>(item: StoredItem) {
  const rest: Record<string, unknown> = { ...item };
  delete rest.pk;
  delete rest.sk;
  delete rest.kind;
  delete rest.gsi1pk;
  delete rest.gsi1sk;
  delete rest.tenantId;
  return rest as T;
}

function normalizePath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}

function isScheduledEvent(event: APIGatewayProxyEventV2 | ScheduledEvent): event is ScheduledEvent {
  return "source" in event && event.source === "aws.events";
}

async function readJson(event: APIGatewayProxyEventV2) {
  if (!event.body) {
    return {};
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(raw) as Record<string, unknown>;
}

function json(statusCode: number, body: unknown, origin?: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function empty(statusCode: number, origin?: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: "",
  };
}

function corsHeaders(origin?: string) {
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-dev-user-id,x-dev-email,x-dev-tenant-id,x-dev-roles",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function apiBaseUrl(event: APIGatewayProxyEventV2) {
  const host = event.headers.host ?? event.headers.Host;
  return host ? `https://${host}` : "";
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function base64urlToString(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function base64urlToBytes(value: string) {
  return Buffer.from(value, "base64url");
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim();
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function objectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
