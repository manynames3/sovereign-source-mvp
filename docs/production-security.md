# Production Security Notes

This document is for buyer-facing security review and internal pilot planning. It should not be treated as a compliance certification.

## Verified Controls In This Repo

- Cognito Hosted UI authenticates dashboard users.
- Cognito groups provide backend RBAC for buyer, reviewer, supplier, and platform actions.
- Cognito tokens are verified server-side against the user-pool JWKS.
- Tenant id is read from the authenticated user and enforced server-side.
- DynamoDB stores tenant-scoped records.
- S3 document bucket blocks public access and uses server-side encryption.
- Document upload and download access uses short-lived signed URLs.
- RFQ invite tokens are hashed before storage.
- RFQ invite access can expire or be revoked server-side.
- Data-room access checks run server-side before signed document links are returned.
- Audit events are written server-side for access requests, matching, classification, document URL creation, evidence review, RFQ invite release/revocation, supplier response, and evidence-expiration updates.
- Daily evidence-expiration automation updates stale evidence status and records audit events.
- Product copy avoids saying the platform certifies ITAR, CMMC, Nadcap, or supplier compliance.

## Current Pilot Limitations

- The production Cloudflare Pages deployment still needs the deployed Cognito/API environment variables set and redeployed.
- The current pilot user is an all-role operator account for smoke testing. Production pilots should use separate buyer, reviewer, supplier, and platform users.
- Cognito user provisioning is currently an administrator runbook, not an in-app workflow.
- The admin APIs exist, but a full admin console for buyer orgs, users, supplier onboarding, and evidence operations still needs UI polish.
- Signed URLs protect file transfer, but production pilots still need a documented data-retention policy.
- No SOC 2, CMMC, ITAR, FedRAMP, or ISO certification claim is supported by this repo.
- No legal export-control determination is made by the platform.

## Claims Safe To Make

- The pilot uses real authentication and server-side role checks.
- The pilot stores RFQ workflow state in a persistent tenant-scoped database.
- The pilot uses private object storage and signed document URLs.
- The pilot records server-side audit events for sensitive workflow actions.
- The pilot can mark evidence as valid, manual review required, expired, rejected, or access suspended.

## Claims To Avoid

- Do not claim the platform certifies supplier compliance.
- Do not claim the platform guarantees ITAR, CMMC, Nadcap, AS9100, or JCP compliance.
- Do not claim controlled technical data is production-safe until a buyer-approved security review is complete.
- Do not publish customer names, logos, testimonials, or ROI numbers without written approval and measured support.

## Before A Paid Production Pilot

- Configure production Cloudflare environment variables and redeploy.
- Create role-specific Cognito users and remove the shared all-role pilot account.
- Add administrator user-provisioning workflow or document a repeatable Cognito admin runbook.
- Add production data-retention, incident-response, and access-review procedures.
- Add monitoring for Lambda errors, unusual signed URL volume, and failed auth attempts.
- Run a buyer security review against the exact pilot scope before accepting controlled production data.
