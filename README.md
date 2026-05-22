# Sovereign Source MVP

Evidence-backed supplier qualification and secure RFQ routing for defense, aerospace, naval, and precision manufacturing procurement teams.

The MVP reduces wasted RFQ cycles and prevents controlled drawings from being released to suppliers that are unqualified, ineligible, expired, or still waiting on manual review. It does not claim autonomous compliance verification.

## What Is Included

- Next.js App Router, TypeScript, Tailwind CSS, and accessible shadcn-style controls.
- Typed domain model for buyers, suppliers, facilities, capabilities, compliance evidence, RFQs, secure invites, documents, and audit logs.
- Deterministic matching engine with hard blockers and explainable scoring.
- Secure data-room access checks for released, unexpired, non-revoked RFQ invites.
- Evidence review workflow with valid, rejected, expired, and manual-review states.
- Registry adapter stubs for SAM.gov, DDTC/ITAR, Nadcap, SPRS/CMMC, and ISO/AS9100.
- Prisma/PostgreSQL schema, migration SQL, and seed script.
- Vitest tests for matching and document access control.

## Run Locally

Use Node 24.x; `.node-version` is pinned to `24.14.0`.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The demo UI runs against typed seed data in memory so the product walkthrough works without a database.

Useful checks:

```bash
pnpm test
pnpm lint
pnpm build
pnpm prisma:validate
```

## Database Setup

The application includes a Prisma/PostgreSQL model and generated migration at `prisma/migrations/0001_init/migration.sql`.

```bash
cp .env.example .env
pnpm prisma:generate
pnpm db:migrate
pnpm db:seed
```

`DATABASE_URL` should point at a PostgreSQL database. `pnpm db:dev` starts Prisma's local Postgres helper on supported systems and prints a connection URL you can place in `.env`.

## Demo Flow

1. Review the dashboard for RFQs, evidence needing review, access suspensions, and audit events.
2. Open Supplier Directory and compare facility-level capabilities, evidence, machines, and Capacity Confidence.
3. Review or expire evidence in Evidence Review Queue.
4. Create a work package, approve classification, then run matching.
5. Inspect eligible, manual review, and ineligible supplier explanations.
6. Release RFQ invites only to eligible suppliers.
7. Use the supplier portal to view the data room, quote, decline, or no-bid.
8. Confirm audit logs for evidence review, matching, dispatch, document access, response, and revocation.

## Architecture

- `src/lib/domain.ts`: core types and labels.
- `src/lib/seed.ts`: five supplier demo scenario and two seeded RFQs.
- `src/lib/matching.ts`: deterministic eligibility engine and Capacity Confidence scoring.
- `src/lib/access-control.ts`: scoped data-room access decisions and audit metadata.
- `src/lib/registry-adapters.ts`: adapter interfaces and manual-review placeholders.
- `src/components/sovereign-source-app.tsx`: demo-ready buyer, reviewer, and supplier workflows.
- `prisma/schema.prisma`: PostgreSQL persistence model.

## Compliance Language

Use: "Evidence valid", "buyer-approved", "manual review required", and "access suspended".

Avoid: "certified by our platform", "fully autonomous compliance verification", "real-time ITAR/SPRS/Nadcap verification", or "air-gapped marketplace".

## Limitations

- This MVP is not legal advice and is not production-authorized for ITAR, CUI, CDI, CMMC, or export-controlled workloads.
- Do not store real controlled technical data in local or demo mode.
- SAM.gov, DDTC/DECCS, SPRS/CMMC, Nadcap, and ISO/AS9100 integrations are adapter stubs or manual workflows unless real credentials and documented access paths are added.
- Production would require legal review, export-control review, cloud boundary decisions, FedRAMP/CMMC-aligned controls, incident response, logging retention, key management, and support personnel restrictions.

## Roadmap

- Persist UI workflows to Prisma service methods.
- Add signed object-storage links and per-document watermarking.
- Add customer-approved supplier lists and buyer-specific evidence scopes.
- Add real SAM.gov entity lookup behind the adapter.
- Add tamper-resistant audit export and retention policies.
- Add authenticated RBAC with buyer, supplier, reviewer, and platform-admin sessions.
