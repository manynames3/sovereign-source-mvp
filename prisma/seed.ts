import { PrismaClient } from "../src/generated/prisma/client";
import { demoData } from "../src/lib/seed";

const prisma = new PrismaClient();

function asDate(value?: string) {
  return value ? new Date(value) : undefined;
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.rFQInvite.deleteMany();
  await prisma.rFQ.deleteMany();
  await prisma.supplierMatch.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workPackage.deleteMany();
  await prisma.capacitySignal.deleteMany();
  await prisma.registryCheck.deleteMany();
  await prisma.complianceEvidence.deleteMany();
  await prisma.machine.deleteMany();
  await prisma.capability.deleteMany();
  await prisma.supplierProfile.deleteMany();
  await prisma.facility.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  await prisma.organization.createMany({
    data: demoData.organizations.map((organization) => ({
      ...organization,
      createdAt: new Date(organization.createdAt),
      updatedAt: new Date(organization.updatedAt),
    })),
  });

  await prisma.user.createMany({
    data: demoData.users.map((user) => ({
      ...user,
      createdAt: new Date(user.createdAt),
    })),
  });

  await prisma.facility.createMany({ data: demoData.facilities });
  await prisma.supplierProfile.createMany({ data: demoData.supplierProfiles });
  await prisma.capability.createMany({ data: demoData.capabilities });
  await prisma.machine.createMany({ data: demoData.machines });

  await prisma.complianceEvidence.createMany({
    data: demoData.complianceEvidence.map((evidence) => ({
      ...evidence,
      issueDate: asDate(evidence.issueDate),
      expirationDate: asDate(evidence.expirationDate),
      reviewedAt: asDate(evidence.reviewedAt),
    })),
  });

  await prisma.registryCheck.createMany({
    data: demoData.registryChecks.map((check) => ({
      ...check,
      checkedAt: new Date(check.checkedAt),
    })),
  });

  await prisma.capacitySignal.createMany({
    data: demoData.capacitySignals.map((signal) => ({
      ...signal,
      observedAt: new Date(signal.observedAt),
    })),
  });

  await prisma.workPackage.createMany({
    data: demoData.workPackages.map((workPackage) => ({
      ...workPackage,
      classificationApprovedAt: asDate(workPackage.classificationApprovedAt),
      dueDate: new Date(workPackage.dueDate),
    })),
  });

  await prisma.document.createMany({
    data: demoData.documents.map((document) => ({
      ...document,
      createdAt: new Date(document.createdAt),
    })),
  });

  await prisma.rFQ.createMany({
    data: demoData.rfqs.map((rfq) => ({
      ...rfq,
      createdAt: new Date(rfq.createdAt),
      sentAt: asDate(rfq.sentAt),
    })),
  });

  await prisma.rFQInvite.createMany({
    data: demoData.rfqInvites.map((invite) => ({
      ...invite,
      expiresAt: new Date(invite.expiresAt),
      sentAt: asDate(invite.sentAt),
      viewedAt: asDate(invite.viewedAt),
    })),
  });

  await prisma.auditLog.createMany({
    data: demoData.auditLogs.map((log) => ({
      ...log,
      createdAt: new Date(log.createdAt),
    })),
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
