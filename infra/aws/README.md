# AWS Low-Idle Pilot Infrastructure

This Terraform stack creates the paid-pilot backend without always-on compute:

- Cognito user pool, hosted UI domain, app client, and role groups.
- DynamoDB on-demand single table with tenant-scoped records.
- Private S3 document bucket with signed URL access only.
- Lambda Function URL API with server-side JWT validation.
- Short-retention CloudWatch logs.
- Optional AWS Budget alert.

It intentionally does not create ECS/Fargate, ALB/NLB, NAT Gateway, RDS/Aurora, or API Gateway.

## Deploy

Build the Lambda bundle first:

```bash
pnpm serverless:build
```

Initialize and plan:

```bash
cd infra/aws
terraform init
terraform plan \
  -var='budget_alert_email=you@example.com' \
  -var='cloudflare_pages_url=https://sovereign-source-mvp.pages.dev'
```

Apply only after reviewing the plan:

```bash
terraform apply \
  -var='budget_alert_email=you@example.com' \
  -var='cloudflare_pages_url=https://sovereign-source-mvp.pages.dev'
```

Use the outputs to configure Cloudflare Pages:

- `NEXT_PUBLIC_API_BASE_URL` = `api_base_url`
- `NEXT_PUBLIC_COGNITO_DOMAIN` = `cognito_domain`
- `NEXT_PUBLIC_COGNITO_CLIENT_ID` = `cognito_client_id`
- `NEXT_PUBLIC_COGNITO_REDIRECT_URI` = `https://sovereign-source-mvp.pages.dev/dashboard`

## Cognito User Setup

For each Cognito user, set:

- email
- `custom:tenant_id`
- group membership matching one role:
  - `BUYER_ADMIN`
  - `BUYER_PROCUREMENT`
  - `SUPPLIER_ADMIN`
  - `SUPPLIER_ESTIMATOR`
  - `COMPLIANCE_REVIEWER`
  - `PLATFORM_ADMIN`

The API rejects protected requests without a valid Cognito JWT, tenant id, and role.

## API Coverage

Public:

- `GET /health`
- `POST /access/request`
- `GET /data-room/{token}`
- `POST /data-room/{token}/respond`

Authenticated:

- `GET /me`
- `POST /admin/demo-seed`
- `GET /suppliers`
- `POST /suppliers`
- `GET /evidence`
- `POST /evidence`
- `PATCH /evidence/{id}/review`
- `GET /work-packages`
- `POST /work-packages`
- `PATCH /work-packages/{id}/classification`
- `POST /work-packages/{id}/documents/upload-url`
- `POST /work-packages/{id}/match`
- `POST /rfqs`
- `POST /rfqs/{id}/invites`
- `PATCH /invites/{id}/revoke`
- `GET /audit/export?format=text`

## Cost Controls

- DynamoDB uses `PAY_PER_REQUEST`, so there is no provisioned-capacity idle cost.
- Lambda Function URL avoids API Gateway and has no always-on compute.
- S3 is private and usage-based.
- CloudWatch log retention defaults to 7 days.
- The optional budget creates 50% actual and 100% forecasted alerts against the configured monthly amount.
