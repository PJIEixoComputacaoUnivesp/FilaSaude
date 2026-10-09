import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

const JSON_BODY_LIMIT = '100kb';

export function configureApp(app: NestExpressApplication): void {
  app.use(
    express.json({
      limit: JSON_BODY_LIMIT,
      verify: (request, _response, buffer) => {
        (request as Request & { rawBody?: Buffer }).rawBody =
          Buffer.from(buffer);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(parserErrorHandler);
}

function parserErrorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }

  const type =
    isRecord(error) && typeof error.type === 'string' ? error.type : null;
  if (type === 'entity.parse.failed') {
    response.status(400).json({
      code: 'malformed_json',
      message: 'O corpo não contém JSON válido.',
    });
    return;
  }
  if (type === 'entity.too.large') {
    response.status(413).json({
      code: 'payload_too_large',
      message: 'O corpo excede o limite permitido.',
    });
    return;
  }

  next(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
