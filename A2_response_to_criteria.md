Assignment 2 - Cloud Services Exercises - Response to Criteria
================================================

Overview
------------------------------------------------

- **Name:** Max Gosling
- **Student number:** n11543027
- **Application name:** SnapNotes
- **Two line description:** SnapNotes is a cloud-native note-taking and media app. Users can authenticate with Cognito, upload files to S3, and manage metadata in DynamoDB. The app demonstrates serverless persistence, stateless design, and secure access.
- **EC2 instance name or ID:** i-0a131169132f6ef5b

------------------------------------------------

### Core - First data persistence service

- **AWS service name:** S3
- **What data is being stored?:** User-uploaded images/attachments
- **Why is this service suited to this data?:** S3 provides highly durable, scalable object storage for unstructured binary files. It integrates directly with pre-signed URLs for secure client uploads.
- **Why are the other services used not suitable for this data?:** DynamoDB and ElastiCache are for structured/ephemeral data; EC2 storage is ephemeral and not fault-tolerant.
- **Bucket/instance/table name:** cab432-maxgosling
- **Video timestamp:** 00:20 – 01:10
- **Relevant files:**
    - `src/services/s3.service.js`
    - `src/controllers/upload.controller.js`
    - `public/upload.html`

### Core - Second data persistence service

- **AWS service name:** DynamoDB
- **What data is being stored?:** Notes metadata (captions, tags, S3 key, userId)
- **Why is this service suited to this data?:** DynamoDB is serverless, scales automatically, and handles flexible key-value storage for fast lookup by userId/noteId.
- **Why are the other services used not suitable for this data?:** S3 cannot provide query/indexing; ElastiCache is ephemeral; RDS would add unnecessary complexity for simple key-value storage.
- **Bucket/instance/table name:** notes-table
- **Video timestamp:** 01:10 – 01:50
- **Relevant files:**
    - `src/services/dynamo.service.js`
    - `src/controllers/notes.controller.js`

### S3 Pre-signed URLs

- **S3 Bucket names:** cab432-maxgosling
- **Video timestamp:** 01:50 – 02:20
- **Relevant files:**
    - `src/services/s3.service.js`
    - `public/upload.js`

### In-memory cache

- **ElastiCache instance name:** snapnotes-cache
- **What data is being cached?:** Recently accessed note metadata / presigned URLs
- **Why is this data likely to be accessed frequently?:** Notes and media are often re-opened shortly after upload; caching reduces repeated DynamoDB lookups and S3 URL generation.
- **Video timestamp:** 02:20 – 02:50
- **Relevant files:**
    - `src/services/cache.service.js`

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** Temporary upload buffers in memory before being written to S3.
- **Why is this data not considered persistent state?:** If lost, it can be re-uploaded; persistent state is always in S3/DynamoDB.
- **How does your application ensure data consistency if the app suddenly stops?:** Uploads are only confirmed after S3/DynamoDB writes succeed. Failed uploads are retried via pre-signed URL on the client.
- **Video timestamp:** 02:50 – 03:20
- **Relevant files:**
    - `src/controllers/upload.controller.js`

### Graceful handling of persistent connections

- **Type of persistent connection and use:** SSE / long-lived HTTP for upload progress.
- **Method for handling lost connections:** Client auto-reconnects; user notified until connection is re-established.
- **Video timestamp:** 03:20 – 03:50
- **Relevant files:**
    - `public/upload.js`
    - `src/controllers/upload.controller.js`

### Core - Authentication with Cognito

- **User pool name:** snapnotes-userpool
- **How are authentication tokens handled by the client?:** Client stores JWT tokens from Cognito in localStorage/session; tokens attached to API requests via `Authorization: Bearer <token>`.
- **Video timestamp:** 03:50 – 04:30
- **Relevant files:**
    - `src/services/cognito.service.js`
    - `src/middleware/auth.middleware.js`
    - `public/auth.html`

### Cognito multi-factor authentication

- **What factors are used for authentication:** Password + SMS OTP
- **Video timestamp:** 04:30 – 05:00
- **Relevant files:**
    - `src/services/cognito.service.js`

### Cognito federated identities

- **Identity providers used:** Google + native email/password
- **Video timestamp:** 04:30 – 05:00
- **Relevant files:**
    - `infra/modules/cognito.tf`

### Cognito groups

- **How are groups used to set permissions?:** Admin group can delete notes; user group can only CRUD their own notes.
- **Video timestamp:** 04:30 – 05:00
- **Relevant files:**
    - `src/middleware/auth.middleware.js`

### Core - DNS with Route53

- **Subdomain**: snapnotes.cab432.com
- **Video timestamp:** 05:00 – 05:30

### Parameter store

- **Parameter names:**
    - `/snapnotes/frontend_origin`
    - `/snapnotes/api_base_url`
- **Video timestamp:** 05:30 – 06:00
- **Relevant files:**
    - `config/param-store.js`

### Secrets manager

- **Secrets names:**
    - `snapnotes-jwt-secret`
    - `snapnotes-db-password`
- **Video timestamp:** 06:00 – 06:30
- **Relevant files:**
    - `config/secrets.js`

### Infrastructure as code

- **Technology used:** Terraform
- **Services deployed:** S3, DynamoDB, Cognito, ElastiCache, Route53, IAM roles
- **Video timestamp:** 06:30 – 07:10
- **Relevant files:**
    - `infra/main.tf`
    - `infra/modules/{s3,dynamo,cognito,elasticache,route53}.tf`
