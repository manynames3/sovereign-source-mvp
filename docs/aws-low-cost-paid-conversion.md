# Low-Cost Paid-Conversion Architecture

This plan keeps idle/minimal-use AWS spend under about $10/month by avoiding always-on compute and hourly networking resources. It is a deployment plan, not a deployment record; no AWS resources are created by this repo change.

## Cost Boundary

Use these services first:

- Cloudflare Pages for the static Next.js frontend.
- Amazon Cognito Hosted UI for buyer/admin sign-in.
- AWS Lambda Function URLs for backend endpoints, with JWT validation in the function.
- DynamoDB on-demand tables for tenants, users, access requests, RFQs, orders, document metadata, and audit events.
- S3 for document/object storage with short-lived signed URLs.
- CloudWatch Logs with short retention and explicit alarms/budgets.

Avoid these until revenue or traffic justifies them:

- ECS/Fargate services that stay running.
- Application Load Balancers or Network Load Balancers.
- NAT gateways.
- RDS/Aurora databases.
- API Gateway if Lambda Function URLs are enough.
- Managed SIEM, WAF, KMS custom key sprawl, or multi-region replication before a paid security scope requires them.

## Why This Should Stay Under $10/Month At Minimal Use

- Cognito user pools have an ongoing free tier for 10,000 monthly active users for direct Cognito/social sign-in on Lite or Essentials tiers.
- Lambda has a free tier of 1 million requests and 400,000 GB-seconds of compute per month.
- DynamoDB on-demand is pay-per-request and includes free-tier storage allowances; minimal access-request/RFQ/audit traffic should be cents to low dollars.
- S3 has no minimum charge and is usage-based for storage, requests, and transfer; small demo documents should be cents to low dollars.
- CloudWatch Logs can stay low with short retention, but unbounded logs are a real cost risk.

The main cost traps are not user sign-in or a few RFQs. The cost traps are always-on compute, load balancers, NAT gateways, relational databases, high log volume, large file storage, and outbound transfer.

## Production Control Path

1. Create a Cognito user pool, hosted domain, and app client.
2. Lock callback/logout URLs to:
   - `https://sovereign-source-mvp.pages.dev/dashboard`
   - local dev callback only for development.
3. Add server-side JWT validation for all non-demo backend endpoints.
4. Model tenant membership and roles in DynamoDB:
   - `buyer_admin`
   - `buyer_member`
   - `compliance_reviewer`
   - `supplier_admin`
   - `supplier_member`
   - `platform_admin`
5. Enforce tenant and role checks in backend code before every RFQ, document, quote, payment, and audit operation.
6. Store documents in S3 with private buckets only.
7. Generate signed URLs only after a server-side access decision is recorded.
8. Write audit records server-side for login-sensitive actions, document grants, document downloads, quote approvals, payment events, and admin changes.
9. Publish the trust/security page only with controls that are deployed and verified.
10. Add AWS Budgets alerts at $5 and $10 before production traffic.

## Current Repo Coverage

Implemented locally:

- Cognito Hosted UI URL builder and honest demo fallback.
- Public request-access page and FastAPI `/access/request` capture endpoint.
- Server-side audit events for quote-to-order workflow and access requests.
- Quote-to-order backend with human final quote and mock payment gate.
- Public trust page that avoids compliance certification claims.

Still not deployed:

- Real Cognito user pool, app client, domain, callback URLs, and hosted UI branding.
- Server-side session validation and protected `/dashboard` access.
- DynamoDB tenant/RBAC enforcement.
- S3/R2 signed document storage.
- Production audit retention and export.
- CRM integration or notification workflow for access requests.

## Official Pricing References Checked

- Amazon Cognito pricing: https://aws.amazon.com/cognito/pricing/
- AWS Lambda pricing: https://aws.amazon.com/lambda/pricing/
- DynamoDB on-demand pricing: https://aws.amazon.com/dynamodb/pricing/on-demand/
- Amazon S3 pricing: https://aws.amazon.com/s3/pricing/
- Elastic Load Balancing pricing: https://aws.amazon.com/elasticloadbalancing/pricing/
- AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- API Gateway pricing: https://aws.amazon.com/api-gateway/pricing/
