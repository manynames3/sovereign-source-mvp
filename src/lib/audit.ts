import type { AuditLog, User } from "./domain";

export function createAuditLog(input: {
  actor?: User;
  orgId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadataJson?: Record<string, unknown>;
}): AuditLog {
  return {
    id: `audit-${input.action.toLowerCase()}-${Date.now()}`,
    actorUserId: input.actor?.id,
    orgId: input.orgId ?? input.actor?.organizationId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadataJson: input.metadataJson ?? {},
    createdAt: new Date().toISOString(),
  };
}

export function describeAuditAction(action: string) {
  return action
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}
