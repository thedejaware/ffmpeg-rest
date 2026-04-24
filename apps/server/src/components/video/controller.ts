import type { OpenAPIHono } from '@hono/zod-openapi';
import {
  videoToMp4Route,
  videoToMp4UrlRoute,
  extractAudioRoute,
  extractAudioUrlRoute,
  extractFramesRoute,
  extractFramesUrlRoute,
  downloadFrameRoute,
  processVideoRoute
} from './schemas';
import { videoToGifRoute, videoToGifUrlRoute } from './gif-schemas';
import { JobType } from '~/queue';
import { env } from '~/config/env';
import { logger } from '~/config/logger';
import { processMediaJob, getOutputFilename } from '~/utils/job-handler';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, rm } from 'fs/promises';
import { addJob, queueEvents, validateJobResult } from '~/queue';
import { resolveDurationSeconds, applyHybridKeep, plannedTimestamps } from './sampling';

export function registerVideoRoutes(app: OpenAPIHono) {
  app.openapi(videoToMp4Route, async (c) => {
    try {
      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_TO_MP4,
        outputExtension: 'mp4',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          crf: 23,
          preset: 'medium',
          smartCopy: true
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, 'mp4')}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(extractAudioRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const mono = query.mono === 'yes';
      const duration = query.duration;

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_EXTRACT_AUDIO,
        outputExtension: 'wav',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          mono,
          ...(duration && { duration })
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Audio extraction failed' }, 400);
      }

      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, 'wav')}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(extractFramesRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const fps = query.fps || 1;
      const compress = query.compress;
      const duration = query.duration;

      if (!compress) {
        return c.json(
          {
            error: 'compress parameter is required',
            message: 'Please specify compress=zip or compress=gzip to get frames as an archive'
          },
          400
        );
      }

      const extension = compress === 'zip' ? 'zip' : 'tar.gz';

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_EXTRACT_FRAMES,
        outputExtension: extension,
        jobData: ({ inputPath, jobDir }) => ({
          inputPath,
          outputDir: `${jobDir}/frames`,
          fps,
          format: 'png',
          compress,
          ...(duration && { duration })
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Frame extraction failed' }, 400);
      }

      const contentType = compress === 'zip' ? 'application/zip' : 'application/gzip';
      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, '')}_frames.${extension}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(videoToMp4UrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_TO_MP4,
        outputExtension: 'mp4',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          crf: 23,
          preset: 'medium',
          smartCopy: true,
          uploadToS3: true
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(extractAudioUrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const mono = query.mono === 'yes';
      const duration = query.duration;

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_EXTRACT_AUDIO,
        outputExtension: 'wav',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          mono,
          uploadToS3: true,
          ...(duration && { duration })
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Audio extraction failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(extractFramesUrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const fps = query.fps || 1;
      const compress = query.compress;
      const duration = query.duration;

      if (!compress) {
        return c.json(
          {
            error: 'compress parameter is required',
            message: 'Please specify compress=zip or compress=gzip to get frames as an archive'
          },
          400
        );
      }

      const extension = compress === 'zip' ? 'zip' : 'tar.gz';

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_EXTRACT_FRAMES,
        outputExtension: extension,
        jobData: ({ inputPath, jobDir }) => ({
          inputPath,
          outputDir: `${jobDir}/frames`,
          fps,
          format: 'png',
          compress,
          uploadToS3: true,
          ...(duration && { duration })
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Frame extraction failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(downloadFrameRoute, (c) => {
    return c.json(
      {
        error: 'Not implemented - use compress parameter on POST /video/frames instead'
      },
      501
    );
  });

  app.openapi(videoToGifRoute, async (c) => {
    try {
      const { file } = c.req.valid('form');
      const query = c.req.valid('query');

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_TO_GIF,
        outputExtension: 'gif',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          fps: query.fps,
          width: query.width
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputBuffer) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.body(new Uint8Array(result.outputBuffer), 200, {
        'Content-Type': 'image/gif',
        'Content-Disposition': `attachment; filename="${getOutputFilename(file.name, 'gif')}"`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(videoToGifUrlRoute, async (c) => {
    try {
      if (env.STORAGE_MODE !== 's3') {
        return c.json({ error: 'S3 mode not enabled' }, 400);
      }

      const { file } = c.req.valid('form');
      const query = c.req.valid('query');

      const result = await processMediaJob({
        file,
        jobType: JobType.VIDEO_TO_GIF,
        outputExtension: 'gif',
        jobData: ({ inputPath, outputPath }) => ({
          inputPath,
          outputPath,
          fps: query.fps,
          width: query.width,
          uploadToS3: true
        })
      });

      if (!result.success) {
        return c.json({ error: result.error }, 400);
      }

      if (!result.outputUrl) {
        return c.json({ error: 'Conversion failed' }, 400);
      }

      return c.json({ url: result.outputUrl }, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });

  app.openapi(processVideoRoute, async (c) => {
    const startTime = Date.now();
    try {
      const { file } = c.req.valid('form');
      const query = c.req.valid('query');
      const fps = query.fps;
      // Resolve the analysis window: `windowSeconds` (alias) wins, then
      // `duration`, then default to 5s. Always pass the resolved value into
      // the worker so audio + frames cover the same window.
      const durationSeconds = resolveDurationSeconds({
        duration: query.duration,
        windowSeconds: query.windowSeconds
      });

      logger.info(
        { fileName: file.name, fileSize: file.size, fps, durationSeconds },
        '[/video/process] Request received'
      );

      // Write input file once, shared by both jobs
      const jobId = randomUUID();
      const jobDir = path.join(env.TEMP_DIR, `process-${jobId}`);
      const inputPath = path.join(jobDir, 'input');
      const audioOutputPath = path.join(jobDir, 'audio.wav');
      const framesOutputDir = path.join(jobDir, 'frames');

      await mkdir(jobDir, { recursive: true });
      const inputBuffer = Buffer.from(await file.arrayBuffer());
      await writeFile(inputPath, inputBuffer);

      // Run audio and frame extraction in parallel
      const [audioJob, framesJob] = await Promise.all([
        addJob(JobType.VIDEO_EXTRACT_AUDIO, {
          inputPath,
          outputPath: audioOutputPath,
          mono: true,
          duration: durationSeconds
        }),
        addJob(JobType.VIDEO_EXTRACT_FRAMES, {
          inputPath,
          outputDir: framesOutputDir,
          fps,
          format: 'jpg',
          quality: 2,
          duration: durationSeconds
        })
      ]);

      const [audioRawResult, framesRawResult] = await Promise.all([
        audioJob.waitUntilFinished(queueEvents),
        framesJob.waitUntilFinished(queueEvents)
      ]);

      const audioResult = validateJobResult(audioRawResult);
      const framesResult = validateJobResult(framesRawResult);

      // Read audio as base64
      let audioBase64 = '';
      let hasAudio = false;
      if (audioResult.success && audioResult.outputPath) {
        audioBase64 = readFileSync(audioResult.outputPath).toString('base64');
        hasAudio = true;
      }

      // Read frames as base64 array (sorted lexicographically → chronological)
      let frames: string[] = [];
      if (framesResult.success) {
        const frameFiles = readdirSync(framesOutputDir)
          .filter((f) => f.endsWith('.jpg'))
          .sort();
        for (const frameFile of frameFiles) {
          const framePath = path.join(framesOutputDir, frameFile);
          frames.push(readFileSync(framePath).toString('base64'));
        }
      }

      // Apply hybrid sampling drop for the duration=5 + fps=2 preset. For
      // every other (duration, fps) pair this is a no-op, preserving the
      // legacy behavior for callers still passing `duration=3`.
      frames = applyHybridKeep(frames, durationSeconds, fps);
      const timestamps = plannedTimestamps(durationSeconds, fps).slice(0, frames.length);

      // Cleanup temp files
      await rm(jobDir, { recursive: true, force: true });

      if (!framesResult.success && !audioResult.success) {
        logger.error(
          { audioError: audioResult.error, framesError: framesResult.error, elapsed: Date.now() - startTime },
          '[/video/process] Both extractions failed'
        );
        return c.json({ error: audioResult.error || framesResult.error || 'Processing failed' }, 400);
      }

      logger.info(
        {
          hasAudio,
          frameCount: frames.length,
          timestamps,
          audioSize: audioBase64.length,
          durationSeconds,
          fps,
          elapsed: Date.now() - startTime
        },
        '[/video/process] Response sent'
      );

      return c.json(
        {
          audioBase64,
          frames,
          timestamps,
          hasAudio,
          frameCount: frames.length
        },
        200
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, elapsed: Date.now() - startTime }, '[/video/process] Request failed');
      return c.json({ error: 'Processing failed', message: errorMessage }, 500);
    }
  });
}
