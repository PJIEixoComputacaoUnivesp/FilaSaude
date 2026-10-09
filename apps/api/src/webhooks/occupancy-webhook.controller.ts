import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { OccupancyWebhookService } from './occupancy-webhook.service.js';

@Controller('webhooks/v1/occupancy')
export class OccupancyWebhookController {
  constructor(private readonly webhook: OccupancyWebhookService) {}

  @Post()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ): Promise<void> {
    const contentType = request.header('content-type');
    if (!isJsonContentType(contentType)) {
      response.status(415).json({
        code: 'unsupported_content_type',
        message: 'O Content-Type deve ser application/json.',
      });
      return;
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      response.status(400).json({
        code: 'raw_body_unavailable',
        message: 'Não foi possível ler o corpo original da requisição.',
      });
      return;
    }

    await this.webhook.receive(
      {
        contentType,
        source: request.header('x-webhook-source'),
        timestamp: request.header('x-webhook-timestamp'),
        signature: request.header('x-webhook-signature'),
      },
      rawBody,
    );
    response.status(202).send();
  }
}

function isJsonContentType(contentType: string | undefined): boolean {
  return (
    contentType?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
  );
}
