# Pilot Proposal: Supplier Evidence Graph + Controlled RFQ Routing

## Pilot Goal

Prove that a buyer can route controlled manufacturing RFQs to a smaller, better-qualified supplier set with evidence, reasons, and data-room auditability.

## Pilot Duration

6 to 8 weeks.

## Included Workflows

- Supplier directory.
- Facility capability profile.
- Evidence vault.
- Evidence review queue.
- Work package builder.
- Classification approval gate.
- Deterministic matching.
- Secure RFQ invite/data-room flow.
- Supplier quote, decline, and no-bid workflow.
- Exportable audit trail.

## Required Production Hardening

- Real auth and RBAC.
- Tenant-isolated persistent database.
- Server-side matching and document-access checks.
- R2 or S3 object storage with expiring signed URLs.
- Server-side audit logging.
- Evidence file upload, review, expiration, and access suspension.
- Invite tokens that expire and revoke server-side.
- Admin console for buyers, suppliers, reviewers, and demo data.

## Pilot Data Rule

Use sanitized, synthetic, public, or buyer-approved non-controlled files unless the deployment boundary has passed legal, export-control, and security review.

## Success Criteria

- Buyer creates and classifies a controlled RFQ package.
- Reviewer validates required evidence or marks manual review required.
- Matching explains eligible, manual review, and ineligible suppliers.
- Buyer releases data-room access only to eligible suppliers.
- Supplier responds with quote, decline, or no-bid.
- Buyer exports audit evidence for the transaction.
