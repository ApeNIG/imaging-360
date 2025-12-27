# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

360-imaging is a 360-degree vehicle photography platform with:
- **Mobile app** (React Native/Expo) — studio360, walk360, stills capture
- **Backend API** (Express/TypeScript) — auth, sessions, presign, events, images
- **Portal** (React/Vite) — session management, gallery, 360 viewer, publish workflow
- **Workers** — thumbnail generation, QC, deduplication
- **Infrastructure** (Terraform) — S3, SQS, RDS PostgreSQL, IAM

## Monorepo Structure

```
360-auto-construct/
├── apps/
│   ├── api/          # Express backend
│   ├── mobile/       # React Native (Expo)
│   └── portal/       # React + Vite
├── packages/
│   └── shared/       # Types, constants, validation
├── infra/
│   └── terraform/    # AWS infrastructure
├── db/
│   └── migrations/   # SQL migrations
└── docs/             # Architecture, API, data model, tickets
```

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run all apps in development
pnpm dev

# Run specific app
pnpm --filter @360-imaging/api dev
pnpm --filter @360-imaging/portal dev
pnpm --filter @360-imaging/mobile dev

# Build all
pnpm build

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
- All queries include `org_id` scope
- Site-specific resources scoped to `org_id` AND `site_id`
- Row-level security enabled in PostgreSQL

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
| `packages/shared/src/constants.ts` | Shared constants |
| `apps/api/src/server.ts` | API entry point |
| `apps/api/src/middleware/auth.ts` | JWT auth middleware |
| `apps/mobile/src/services/upload-queue.ts` | Offline upload queue |
| `db/migrations/001_initial_schema.sql` | Database schema |

## Canonical Documentation

- `/docs/architecture.md` — System design, component relationships
- `/docs/api.md` — API contracts, OpenAPI spec
- `/docs/data-model.md` — Entity definitions, schema
- `/docs/tickets/sprint-1.md` — Sprint 1 tickets with acceptance criteria
