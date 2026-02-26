# AGENTS.md — FFmpeg REST API

This file is for coding agents only. Keep it short and operational.
For architecture/background, use `README.md`.

## Quick Setup

- Required: Node.js 22+, `ffmpeg`, and `ffprobe` in `PATH`
- Install deps: `npm ci`
- Local dev infra: `docker-compose up -d` (Redis)
- Dev processes (separate terminals):
  - `npm run dev`
  - `npm run dev:worker`

## Validation Gates

Run these before finishing a code change:

- `npm run typecheck`
- `npm run test:app`

Run integration tests when changes touch Docker/container runtime, S3 mode, networking, process boundaries, or startup/config behavior:

- `npm run test:integration`

Use `npm run format` if formatting is needed.

## High-Signal Rules

- Use `child_process.execFile` for FFmpeg/FFprobe calls. Never use `exec`.
- Keep route contracts schema-first via `createRoute()` and Zod validation.
- Keep conversion endpoint parity:
  - Binary endpoint (`/path`)
  - S3 URL endpoint (`/path/url`) with `uploadToS3: true`
- Use `processMediaJob()` for conversion endpoints; `/media/info` is the exception.
- Prefer `~/` imports for modules under `src/`.

## Change Touchpoints

When adding a new endpoint that reuses an existing job type:

1. `components/<domain>/schemas*.ts` + `controller.ts`
2. Tests (`controller.test.ts`, and integration tests when behavior crosses process/storage boundaries)

When adding a new job type:

1. `queue/<domain>/schemas*.ts` + `processor*.ts`
2. `src/queue/index.ts` (`JobType`)
3. `src/worker.ts` (register processor in the worker switch)
4. `components/<domain>/schemas*.ts` + `controller.ts`
5. Tests (`processor.test.ts`, `controller.test.ts`, and integration tests when behavior crosses process/storage boundaries)

Update `src/app.ts` only when adding a new route module/domain (new `register*Routes` call).

## Testing Principle

- Prefer behavior tests with real FFmpeg outputs over mocks.
