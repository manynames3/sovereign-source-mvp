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

Open [http://localhost:3000](http://localhost:3000) for the landing page or [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the demo workspace. The demo UI runs against typed seed data in memory so the product walkthrough works without a database.

Useful checks:

```bash
pnpm test
pnpm lint
pnpm build
pnpm prisma:validate
```

## Metal Quote-to-Order Backend

This repo now includes a separate FastAPI backend for custom metal part quote-to-order intake. It is intentionally **not** a marketplace, supplier-matching engine, automated supplier router, ML pricing system, or guaranteed instant quote product.

The workflow is:

1. Upload a metal part file and get a budgetary estimate.
2. Submit the estimate as an RFQ/order-intent record.
3. Admin reviews manufacturability.
4. Admin creates a final quote.
5. Customer approves the final quote.
6. Customer pays a deposit or full amount through a mock payment session.
7. Order moves into paid/order-ready state.

Core product rule: instant estimates are lead/order-intent tools only. Final quote, payment, and order creation require human/admin review first.

### Backend Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

The backend defaults to SQLite at `metal_quote.db` and local uploads under `uploads/`.

Run backend tests:

```bash
.venv/bin/pytest -q
```

### API Overview

- `POST /quote/metal`: upload file and create budgetary estimate.
- `POST /rfq/submit`: convert budgetary estimate to RFQ/order intent.
- `PATCH /admin/rfq/{rfq_id}/review`: admin manufacturability review.
- `POST /admin/rfq/{rfq_id}/final-quote`: create final quote after review.
- `GET /quote/final/{final_quote_id}`: customer-safe final quote.
- `POST /quote/final/{final_quote_id}/approve`: customer approves final quote and creates order.
- `POST /quote/final/{final_quote_id}/reject`: customer rejects final quote.
- `POST /orders/{order_id}/payment-session`: create mock payment session.
- `POST /payments/mock-confirm`: confirm mock payment as paid or failed.
- `GET /orders/{order_id}`: retrieve order record.
- `POST /access/request`: capture a pilot/demo access request with server-side audit.

### Example Workflow

Create a small DXF file:

```bash
cat > /tmp/sample-part.dxf <<'DXF'
0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
100
21
50
0
ENDSEC
0
EOF
DXF
```

Create a budgetary estimate:

```bash
curl -s http://localhost:8000/quote/metal \
  -F "file=@/tmp/sample-part.dxf" \
  -F "process_type=laser_cutting" \
  -F "material=aluminum_6061" \
  -F "thickness_mm=3" \
  -F "quantity=5" \
  -F "finish=deburred" \
  -F "tolerance=standard" \
  -F "shipping_zip=78701" \
  -F "notes=standard bracket"
```

Response shape:

```json
{
  "quote_id": "quote_abc123",
  "quote_type": "budgetary_estimate",
  "estimated_price_range": { "low": 120.0, "high": 180.0 },
  "review_required": false,
  "next_step": "Submit RFQ for manufacturability review and final quote.",
  "disclaimer": "This is a budgetary estimate only. Final price, lead time, and manufacturability must be confirmed before production."
}
```

Submit RFQ:

```bash
curl -s http://localhost:8000/rfq/submit \
  -H "Content-Type: application/json" \
  -d '{
    "quote_id": "quote_abc123",
    "customer_name": "Ada Mason",
    "email": "ada@example.com",
    "phone": "555-0100",
    "company": "Apex Metal Buyers",
    "notes": "Please review for production.",
    "consent_to_review": true
  }'
```

Response shape:

```json
{
  "rfq_id": "rfq_abc123",
  "quote_id": "quote_abc123",
  "status": "needs_review",
  "next_step": "Admin manufacturability review is required before final quote."
}
```

Admin review:

```bash
curl -s -X PATCH http://localhost:8000/admin/rfq/rfq_abc123/review \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ready_for_final_quote",
    "internal_notes": "Flat part looks manufacturable.",
    "reviewed_by": "admin@example.com",
    "manufacturability_notes": "Use 3 mm 6061 sheet, deburr edges.",
    "recommended_process": "laser_cutting",
    "required_changes": null,
    "review_required": false
  }'
```

Create final quote:

```bash
curl -s http://localhost:8000/admin/rfq/rfq_abc123/final-quote \
  -H "Content-Type: application/json" \
  -d '{
    "final_price": 875,
    "final_lead_time_days": 9,
    "final_process_type": "laser_cutting",
    "final_material": "aluminum_6061",
    "final_finish": "deburred",
    "quote_expiration_date": "2027-02-01",
    "production_notes": "Final quote after human manufacturability review.",
    "payment_required_type": "deposit",
    "deposit_amount": 250
  }'
```

Response shape:

```json
{
  "final_quote_id": "final_quote_abc123",
  "rfq_id": "rfq_abc123",
  "status": "pending_customer_approval",
  "final_price": 875,
  "payment_required_type": "deposit",
  "deposit_amount": 250
}
```

Customer approval:

```bash
curl -s -X POST http://localhost:8000/quote/final/final_quote_abc123/approve
```

Response shape:

```json
{
  "final_quote_id": "final_quote_abc123",
  "rfq_id": "rfq_abc123",
  "order_id": "order_abc123",
  "status": "approved",
  "payment_required": true
}
```

Create mock payment session:

```bash
curl -s -X POST http://localhost:8000/orders/order_abc123/payment-session
```

Response shape:

```json
{
  "payment_session_id": "pay_abc123",
  "payment_url": "/payments/mock/pay_abc123?amount=250.00&type=deposit",
  "amount_due": 250,
  "payment_type": "deposit",
  "status": "pending"
}
```

Confirm mock payment:

```bash
curl -s http://localhost:8000/payments/mock-confirm \
  -H "Content-Type: application/json" \
  -d '{ "payment_session_id": "pay_abc123", "payment_status": "paid" }'
```

Response shape:

```json
{
  "payment_session_id": "pay_abc123",
  "order_id": "order_abc123",
  "payment_status": "paid",
  "order_status": "paid",
  "rfq_status": "paid",
  "amount_paid": 250,
  "balance_due": 625
}
```

Retrieve paid order:

```bash
curl -s http://localhost:8000/orders/order_abc123
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

## Cognito Login

The landing page includes a Cognito Hosted UI sign-in CTA. Configure these public environment variables before using it outside demo mode:

- `NEXT_PUBLIC_COGNITO_DOMAIN`
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- `NEXT_PUBLIC_COGNITO_REDIRECT_URI`
- `NEXT_PUBLIC_COGNITO_SCOPE`
- `NEXT_PUBLIC_COGNITO_RESPONSE_TYPE`

If the Cognito domain or client id is missing, the CTA routes to `/dashboard?auth=demo` and labels the experience as demo mode.

## Request Access Capture

The public `/request-access` page posts to the FastAPI backend when `NEXT_PUBLIC_API_BASE_URL` is configured. Local development defaults to `http://localhost:8000`; production deployments should set this to the deployed backend URL.

```bash
curl -s http://localhost:8000/access/request \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ada Mason",
    "email": "ada@example.com",
    "company": "Apex Metal Buyers",
    "role": "Procurement lead",
    "use_case": "Pilot controlled RFQ intake and final quote review for custom metal parts.",
    "estimated_monthly_rfqs": 25,
    "notes": "Need a reviewed pilot before uploading production data.",
    "consent_to_contact": true
  }'
```

Response shape:

```json
{
  "request_id": "access_abc123",
  "status": "new",
  "company": "Apex Metal Buyers",
  "email": "ada@example.com",
  "next_step": "We will review the request and confirm the right demo or pilot path before enabling production data access."
}
```

## Low-Cost Paid Conversion Plan

See `docs/aws-low-cost-paid-conversion.md` for the sub-$10/month minimal-use AWS architecture. The short version: use Cognito, Lambda Function URLs, DynamoDB on-demand, S3 signed URLs, and short-retention CloudWatch logs. Avoid ECS/Fargate, ALB/NLB, NAT gateways, RDS/Aurora, and other always-on resources until revenue or traffic justifies them.

The repo includes deployable AWS infrastructure under `infra/aws` and a serverless API under `serverless/sovereign-api`.

```bash
pnpm serverless:build
cd infra/aws
terraform init
terraform plan -var='budget_alert_email=you@example.com'
```

The serverless API adds production-shaped endpoints for Cognito JWT validation, tenant-scoped DynamoDB records, server-side matching, signed S3 document URLs, expiring/revocable RFQ invite tokens, supplier quote/decline/no-bid responses, and server-side audit export.

## Demo Flow

1. Open the logged-in Upload Request workspace.
2. Upload a drawing/model or load the sample PO/BOM line list.
3. Review extracted part lines, controlled-data markers, required evidence, and sourcing gates.
4. Review the hybrid sourcing model: software-assisted intake plus curated supplier qualification.
5. Run Find Qualified Vendors to drive deterministic supplier matching, facility qualification, lead-time signals, and human-review gates.
6. Start the controlled titanium bracket walkthrough.
7. Switch roles between Buyer, Compliance Reviewer, and Supplier.
8. Review evidence notes, expirations, and manual-review states.
9. Release RFQ invites only to eligible suppliers.
10. Use the supplier portal data-room modal to view or download fake document records.
11. Quote, decline, or no-bid from the supplier portal.
12. Export the audit trail showing who saw what, when, and why.

## Buyer Artifacts

Static buyer-facing artifacts deploy under `public/artifacts/`:

- `2-minute-demo-script.md`
- `product-brief.md`
- `pilot-proposal.md`
- `sample-roi-claim.md`

## Architecture

- `src/lib/domain.ts`: core types and labels.
- `src/lib/seed.ts`: five supplier demo scenario and two seeded RFQs.
- `src/lib/matching.ts`: deterministic eligibility engine and Capacity Confidence scoring.
- `src/lib/access-control.ts`: scoped data-room access decisions and audit metadata.
- `src/lib/registry-adapters.ts`: adapter interfaces and manual-review placeholders.
- `src/components/sovereign-source-app.tsx`: demo-ready buyer, reviewer, and supplier workflows.
- `src/app/trust/page.tsx`: public trust/security boundary with only verified claims.
- `src/app/request-access/page.tsx`: public access request intake.
- `prisma/schema.prisma`: PostgreSQL persistence model.

## Compliance Language

Use: "Evidence valid", "buyer-approved", "manual review required", and "access suspended".

Avoid platform-certification language, autonomous-verification claims, undocumented real-time registry claims, or air-gapped-system claims.

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
