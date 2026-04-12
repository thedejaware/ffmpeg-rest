import { createRoute, z } from '@hono/zod-openapi';
import {
  FileSchema,
  ErrorSchema,
  MonoQuerySchema,
  DurationQuerySchema,
  FpsQuerySchema,
  CompressQuerySchema,
  FilenameParamSchema,
  DeleteQuerySchema,
  UrlResponseSchema
} from '~/utils/schemas';

export const ProcessVideoResponseSchema = z
  .object({
    audioBase64: z.string().openapi({
      description: 'WAV audio extracted from the video, encoded as base64'
    }),
    frames: z.array(z.string()).openapi({
      description: 'Array of PNG frame images encoded as base64'
    }),
    hasAudio: z.boolean().openapi({
      description: 'Whether the video contained an audio track'
    }),
    frameCount: z.number().openapi({
      description: 'Number of frames extracted'
    })
  })
  .openapi('ProcessVideoResponse');

/**
 * POST /video/mp4 - Convert any video format to MP4
 */
export const videoToMp4Route = createRoute({
  method: 'post',
  path: '/video/mp4',
  tags: ['Video'],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'video/mp4': {
          schema: FileSchema
        }
      },
      description: 'Video converted to MP4 format'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or unsupported format'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Conversion failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /video/mp4/url - Convert any video format to MP4 and return S3 URL
 */
export const videoToMp4UrlRoute = createRoute({
  method: 'post',
  path: '/video/mp4/url',
  tags: ['Video'],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UrlResponseSchema
        }
      },
      description: 'Video converted to MP4 and uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or S3 mode not enabled'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Conversion failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /video/audio - Extract audio track from video
 * Query: mono=yes|no (default: yes for mono/single channel)
 */
export const extractAudioRoute = createRoute({
  method: 'post',
  path: '/video/audio',
  tags: ['Video'],
  request: {
    params: z.object({}),
    query: MonoQuerySchema.merge(DurationQuerySchema),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'audio/wav': {
          schema: FileSchema
        }
      },
      description: 'Extracted audio track as WAV file'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or no audio track found'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Extraction failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /video/audio/url - Extract audio track from video and return S3 URL
 * Query: mono=yes|no (default: yes for mono/single channel)
 */
export const extractAudioUrlRoute = createRoute({
  method: 'post',
  path: '/video/audio/url',
  tags: ['Video'],
  request: {
    params: z.object({}),
    query: MonoQuerySchema.merge(DurationQuerySchema),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UrlResponseSchema
        }
      },
      description: 'Extracted audio track uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or S3 mode not enabled'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Extraction failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /video/frames - Extract frames from video as PNG images
 * Query: fps=1 (frames per second), compress=zip|gzip (required)
 */
export const extractFramesRoute = createRoute({
  method: 'post',
  path: '/video/frames',
  tags: ['Video'],
  request: {
    query: FpsQuerySchema.merge(CompressQuerySchema).merge(DurationQuerySchema),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/zip': {
          schema: FileSchema
        },
        'application/gzip': {
          schema: FileSchema
        }
      },
      description: 'Extracted frames as compressed archive'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or parameters'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Frame extraction failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /video/frames/url - Extract frames from video and return S3 URL
 * Query: fps=1 (frames per second), compress=zip|gzip (required)
 */
export const extractFramesUrlRoute = createRoute({
  method: 'post',
  path: '/video/frames/url',
  tags: ['Video'],
  request: {
    query: FpsQuerySchema.merge(CompressQuerySchema).merge(DurationQuerySchema),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UrlResponseSchema
        }
      },
      description: 'Extracted frames archive uploaded to S3'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or S3 mode not enabled'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Frame extraction failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * GET /video/frames/:filename - Download extracted frame
 * Query: delete=yes|no (default: yes, deletes file after download)
 */
export const downloadFrameRoute = createRoute({
  method: 'get',
  path: '/video/frames/{filename}',
  tags: ['Video'],
  request: {
    params: FilenameParamSchema,
    query: DeleteQuerySchema
  },
  responses: {
    200: {
      content: {
        'image/png': {
          schema: FileSchema
        }
      },
      description: 'Downloaded frame image'
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Frame not found'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Download failed'
    },
    501: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Not implemented'
    }
  }
});

/**
 * POST /video/process - Combined audio + frame extraction
 * Returns JSON with base64-encoded audio and frame images
 * Query: duration (seconds), fps (frames per second)
 */
export const processVideoRoute = createRoute({
  method: 'post',
  path: '/video/process',
  tags: ['Video'],
  request: {
    query: FpsQuerySchema.merge(DurationQuerySchema),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: FileSchema
          })
        }
      },
      required: true
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProcessVideoResponseSchema
        }
      },
      description: 'Extracted audio and frames as base64 JSON'
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Invalid video file or parameters'
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        }
      },
      description: 'Processing failed'
    }
  }
});
