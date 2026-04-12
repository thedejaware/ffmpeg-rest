# FFmpeg REST API — Hookvio Fork

## What is this project?

This is a fork of [crisog/ffmpeg-rest](https://github.com/crisog/ffmpeg-rest), an open-source REST API wrapper around FFmpeg. It accepts media files via HTTP, processes them with FFmpeg, and returns the results.

We forked it to serve as the **video processing backend** for the [Hookvio mobile app](https://github.com/thedejaware/hookvio-mobile-app) — an AI-powered tool that analyzes the first 3 seconds of short-form videos for content creators.

## Why we need this

The mobile app sends video frames + audio to a Supabase Edge Function, which forwards them to OpenAI (GPT-4 Vision for visuals, Whisper for audio). The problem:

- **React Native has no maintained library** for extracting audio from video files
- The app was sending the **entire raw MP4** as "audio" — Whisper rejects it because it expects WAV
- `expo-video-thumbnails` works for frames but produces lower quality than FFmpeg (keyframe-snapping, JPEG-only)

This backend solves both problems: the mobile app uploads a video, and gets back properly extracted WAV audio + high-quality PNG frames.

## Architecture

```
Monorepo (npm workspaces)
├── apps/server     Hono HTTP API — accepts uploads, enqueues jobs
├── apps/worker     BullMQ job processor — runs FFmpeg commands
├── apps/web        Vite frontend with API docs (Scalar)
└── packages/shared Zod schemas shared between server and worker
```

**Stack:** Node.js, Hono, BullMQ, Redis, FFmpeg, Zod, Vitest, Docker

**Data flow:**
```
Mobile App → POST /video/process → Server → Redis Queue → Worker (FFmpeg) → JSON Response
```

## What we changed from the original

### 1. Duration limiting (`-ss 0 -t <duration>`)

Added an optional `duration` query parameter to audio and frame extraction endpoints. When provided, FFmpeg only processes the first N seconds of the video instead of the entire file.

**Files:**
- `packages/shared/src/queue/video/schemas.ts` — added `duration` field to job data schemas
- `apps/server/src/utils/schemas.ts` — added `DurationQuerySchema` (query param, max 300s)
- `apps/server/src/components/video/schemas.ts` — merged duration into route definitions
- `apps/server/src/components/video/controller.ts` — passes duration through to job data
- `apps/worker/src/queue/video/processor.ts` — adds `-ss 0 -t <duration>` to FFmpeg args

### 2. Audio sample rate change (44100 Hz → 16000 Hz)

Changed the WAV output sample rate from 44100 Hz to 16000 Hz. OpenAI Whisper is optimized for 16kHz mono audio — higher sample rates waste bandwidth without improving transcription quality.

**Files:**
- `apps/worker/src/queue/video/processor.ts` — audio extraction from video
- `apps/worker/src/queue/audio/processor.ts` — standalone audio conversion

### 3. Combined `/video/process` endpoint (new)

Added a single endpoint that extracts both audio and frames in one request, returning JSON with base64-encoded data. This avoids the mobile app needing to make two separate uploads or handle ZIP files.

**Endpoint:** `POST /video/process?fps=2&duration=3`

**Request:** Multipart form with a `file` field (video file)

**Response:**
```json
{
  "audioBase64": "UklGR...",
  "frames": ["iVBORw0K...", "iVBORw0K...", ...],
  "hasAudio": true,
  "frameCount": 6
}
```

**Files:**
- `apps/server/src/components/video/schemas.ts` — route + response schema
- `apps/server/src/components/video/controller.ts` — handler that runs audio + frame jobs in parallel

### 4. Tests for new functionality

Added tests covering duration-limited extraction and the 16kHz sample rate change.

**File:** `apps/worker/src/queue/video/processor.test.ts`
- Audio extraction respects `duration` parameter
- Audio output uses 16kHz sample rate
- Frame extraction respects `duration` parameter
- Existing behavior preserved when no duration is specified

## Deployment

Deployed on **Railway** with the following environment variables:

| Variable | Value | Required |
|---|---|---|
| `STORAGE_MODE` | `stateless` | Yes |
| `AUTH_TOKEN` | *(secret)* | Yes |
| `REDIS_URL` | *(provided by Railway Redis plugin)* | Yes |
| `WORKER_CONCURRENCY` | `5` (default) | No |
| `MAX_FILE_SIZE` | `104857600` (100MB, default) | No |

The `AUTH_TOKEN` must match the `EXPO_PUBLIC_FFMPEG_AUTH_TOKEN` in the mobile app's `.env` files.

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Start Redis (required for BullMQ job queue)
docker compose up -d redis

# 3. Copy env and set AUTH_TOKEN
cp .env.example .env
# Edit .env and set AUTH_TOKEN

# 4. Start server + worker
npm run dev
```

**Requires FFmpeg installed locally** (`brew install ffmpeg` on macOS).

## Running tests

```bash
npm run test:app        # Unit tests (requires FFmpeg)
npm run typecheck       # TypeScript validation (no FFmpeg needed)
```
