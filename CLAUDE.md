# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

360-imaging is a 360-degree vehicle photography platform with:
- **Mobile app** (React Native/Expo) — studio360, walk360, stills capture
- **Backend API** (Express/TypeScript) — auth, sessions, presign, events, images
- **Portal** (React/Vite) — session management, gallery, 360 viewer, publish workflow
- **Worker** (Node/TypeScript) — SQS consumer, thumbnail generation, QC, deduplication
- **Infrastructure** (Terraform) — S3, SQS, RDS PostgreSQL, IAM

## Monorepo Structure

```
apps/
├── api/           # Express backend (port 3000)
├── mobile/        # React Native (Expo)
├── portal/        # React + Vite (port 5173)
└── worker/        # SQS consumer + image pipeline
packages/
└── shared/        # Types, constants, validation (ESM)
infra/terraform/   # AWS infrastructure
db/migrations/     # SQL migrations
docs/              # Architecture, API, data model, tickets
```

## Development Commands

```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# Run all apps in development
pnpm dev

# Run specific app
pnpm --filter @360-imaging/api dev
pnpm --filter @360-imaging/portal dev
pnpm --filter @360-imaging/mobile dev
pnpm --filter @360-imaging/worker dev

# Build all
pnpm build

# Run tests (all or single package)
pnpm test
pnpm --filter @360-imaging/api test
pnpm --filter @360-imaging/api test -- src/services/auth.service.test.ts

# Run database migration
pnpm db:migrate

# Lint and format
pnpm lint
pnpm format
```

## Infrastructure Commands

```bash
cd infra/terraform

# Initialize
terraform init

# Plan changes
terraform plan -var-file=terraform.tfvars

# Apply
terraform apply -var-file=terraform.tfvars

# Get outputs (includes DATABASE_URL)
terraform output environment_config
```

## Specialized Agents

Use these via the Task tool for domain-specific work:

| Agent | Use For |
|-------|---------|
| `orchestrator` | Planning features, creating tickets, coordinating work |
| `solution-architect` | System architecture, data flows, distributed systems |
| `mobile-capture-agent` | Camera capture, burst-mode, offline queuing |
| `backend-api-architect` | API endpoints, auth, RBAC, database schemas |
| `pipeline-worker-architect` | Image processing, queue semantics, idempotency |

## Architecture Principles

### Multi-Tenant Scoping
- All queries include `org_id` scope via repository pattern
- Site-specific resources scoped to `org_id` AND `site_id`
- Row-level security enabled in PostgreSQL
- Use `BaseRepository` methods — never write raw queries without org_id

### Idempotency
- Every write operation needs an idempotency key
- Use deterministic output paths based on input hashes
- Atomic writes: write to temp, then rename

### Storage Layout
```
s3://imaging-{env}/
  org/{org_id}/site/{site_id}/session/{session_id}/
    {uuid}.jpg                    # Original
    thumbs/{uuid}_{size}.jpg      # Thumbnails
```

### Mobile Capture Requirements
- Lock AE/AWB on first reference frame
- Burst-best selection (3-7 frames, pick sharpest)
- Offline-first with SQLite queue
- Presigned URL uploads only

## Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/index.ts` | All TypeScript types |
| `packages/shared/src/constants.ts` | Shared constants (QC thresholds, HTTP status) |
| `apps/api/src/db/repositories/base.repository.ts` | Base repo with org_id scoping |
| `apps/api/src/middleware/auth.ts` | JWT auth middleware |
| `apps/worker/src/consumer.ts` | SQS long-poll consumer |
| `apps/worker/src/pipeline/index.ts` | Image processing orchestrator |
| `db/migrations/001_initial_schema.sql` | Database schema with RLS |

### Worker Pipeline
- S3 event → SQS → Worker consumer (long-poll, 5 concurrent)
- Pipeline stages: thumbnails → QC (sharpness/exposure) → dedup → save
- Uses sharp for image processing
- Graceful shutdown on SIGTERM/SIGINT

## Canonical Documentation

- `/docs/architecture.md` — System design, component relationships
- `/docs/api.md` — API contracts, OpenAPI spec
- `/docs/data-model.md` — Entity definitions, schema
- `/docs/tickets/sprint-1.md` — Sprint 1 tickets with acceptance criteria
