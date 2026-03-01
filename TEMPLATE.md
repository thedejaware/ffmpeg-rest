# Deploy and Host FFmpeg REST API on Railway

A REST API that wraps FFmpeg for media processing operations. Convert videos to MP4, convert to animated GIF, extract audio tracks, extract frames, convert audio to MP3/WAV, convert images to JPG, resize images, and probe media metadata. Built with Node.js, Hono, and BullMQ for reliable async job processing.

<p align="center">
  <img src="https://github.com/crisog/ffmpeg-rest/blob/main/docs-preview.png?raw=true" alt="FFmpeg REST API Test Output" width="800">
</p>

## About Hosting FFmpeg REST API

Hosting FFmpeg REST API requires a Node.js environment with FFmpeg binaries and Redis for job queue management. The API processes media files asynchronously using BullMQ workers and supports two storage modes configured via the `STORAGE_MODE` environment variable:

- **`stateless`** (default) - Files returned directly in HTTP responses
- **`s3`** - Files uploaded to S3-compatible storage, URLs returned

### Stateless Mode (Default)

Files are processed and returned directly in the HTTP response. Simple and straightforward for immediate consumption.

**Cost Consideration**: On Railway, stateless mode is cheaper than running S3 Mode unless you have free egress at your S3-storage provider (like Cloudflare R2). Railway charges **$0.05/GB egress** vs S3's typical **$0.09/GB**, but you trade off file persistence - processed files aren't stored for later retrieval.

#### Stateless Binary Cache

Stateless mode can optionally cache binary conversion outputs using `cacache` to avoid rerunning FFmpeg on identical inputs + params.

- Cache scope: binary conversion endpoints only (not `/.../url` S3 responses, not `/media/info`)
- Cache key: SHA-256 of input bytes + job type + normalized processing params
- Retention: TTL + size cap (enforced on startup, reads, and writes)
- Storage: local filesystem (ephemeral by default)

### S3 Mode

Processed files are uploaded to S3-compatible storage and a URL is returned. This mode significantly reduces egress bandwidth costs since users download the processed files directly from S3 rather than through your API server. Ideal for production deployments where bandwidth costs matter.

**Why Cloudflare R2?** R2 is S3-compatible and offers **no egress fees**, which dramatically lowers costs when serving processed media from your bucket via Cloudflare's global network. While any S3-compatible storage works, R2 is the only major provider with zero egress charges - making it the optimal choice for media delivery.

Configure S3 mode by setting `STORAGE_MODE=s3` and providing S3 credentials in your environment variables (see **Environment Configuration** below).

The API is production-ready with OpenAPI documentation, type-safe validation, and configurable concurrency for optimal resource utilization.

## Architecture

The service uses two Node.js processes connected through Redis:

1. **API Server**: Accepts uploads, creates jobs, waits for completion, and returns binary output or URL responses.
2. **Worker**: Consumes BullMQ jobs and executes FFmpeg/FFprobe processing.

From the caller perspective, requests are synchronous even though processing is queued internally.

## Common Use Cases

- Video conversion and transcoding (any format to MP4)
- Audio extraction from video files (mono/stereo tracks)
- Frame extraction for thumbnail generation or video previews
- Audio format conversion (any format to MP3 or WAV)
- Image format conversion and resizing
- Media metadata analysis and inspection
- Batch media processing workflows
- Automated video processing pipelines

## Dependencies for FFmpeg REST API Hosting

- Node.js 22+
- FFmpeg and FFprobe (installed and available in PATH)
- Redis (for BullMQ job queue)
- S3-compatible storage (optional, for production deployments)

### Deployment Dependencies

- [FFmpeg Download](https://ffmpeg.org/download.html) - Media processing engine
- [Redis Documentation](https://redis.io/docs/) - Job queue backend
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Railway Redis Plugin](https://railway.app/plugins/redis) - Managed Redis instance
- [BullMQ Documentation](https://docs.bullmq.io/) - Background job processing

### Implementation Details

**Environment Configuration:**

```bash
# Required for all deployments
PORT=3000
NODE_ENV=production
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=5
TEMP_DIR=/tmp/ffmpeg-rest
MAX_FILE_SIZE=104857600

# Storage mode ("stateless" or "s3")
STORAGE_MODE=stateless

# Optional stateless binary response cache (for non-/url conversion endpoints)
CACHE_ENABLED=false              # Enable/disable stateless binary cache
CACHE_DIR=/tmp/ffmpeg-rest/cache # Cache directory (defaults to <TEMP_DIR>/cache)
CACHE_TTL_HOURS=2160             # Entry TTL in hours (90 days)
CACHE_MAX_SIZE_MB=1024           # Max cache size on disk in MiB (1 GiB)

# S3-compatible storage configuration (required when STORAGE_MODE=s3)
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=ffmpeg-rest
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Public base URL for serving files (e.g., via Cloudflare CDN / custom domain)
S3_PUBLIC_URL=https://media.yourdomain.com

# Optional prefix for organizing objects in the bucket
S3_PATH_PREFIX=ffmpeg-rest

# Optional content deduplication cache for S3 uploads
S3_DEDUP_ENABLED=true
S3_DEDUP_TTL_DAYS=90

# Optional API bearer auth (if set, all routes require Authorization: Bearer <token>)
AUTH_TOKEN=
```

## Why Deploy FFmpeg REST API on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying FFmpeg REST API on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
