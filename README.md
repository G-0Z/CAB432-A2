# SnapNotes (CAB432 A2 – Cloud Services Exercises)

A stateless image+notes REST API using AWS services. Built to satisfy A2 rubric:

## Core Criteria
- **Two persistence services (6)**: S3 (images), DynamoDB (notes metadata).
- **Cognito Auth (3)**: signup → email confirm → login → returns JWT (access token).
- **Statelessness (3)**: no local state; all data in S3/DynamoDB; cache is ephemeral.
- **Route53 (2)**: CNAME a subdomain to EC2 (document screenshots in `docs/`).

## Additional (choose up to 16)
- **Parameter Store (2)**: store non-secrets like `API_URL`, `FRONTEND_ORIGIN`.
- **Secrets Manager (2)**: store `JWT_SECRET` or DB creds if you add RDS.
- **In-memory caching (3)**: ElastiCache Memcached client in `src/services/cache.service.js`.
- **IaC (3)**: (Optional) provide Terraform/CDK. (Request if you want a full TF stack.)
- **MFA / Federated / Groups (2 each)**: extend Cognito pool & middleware as desired.
- **S3 Pre-signed URLs (2)**: upload & download flows implemented.
- **Graceful persistent connections (2)**: Optional SSE if you add background tasks.

## Run locally
```bash
cp .env.example .env   # create your env
npm i
npm run dev
# open http://localhost:3000/public/
