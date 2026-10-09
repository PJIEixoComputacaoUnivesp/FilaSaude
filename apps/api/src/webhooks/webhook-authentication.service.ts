import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookSourceConfigService } from './webhook-source-config.service.js';

export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

@Injectable()
export class WebhookAuthenticationService {
  constructor(private readonly sourceConfig: WebhookSourceConfigService) {}

  authenticate(
    sourceHeader: string | undefined,
    timestampHeader: string | undefined,
    signatureHeader: string | undefined,
    rawBody: Buffer,
    now = new Date(),
  ): string {
    if (!sourceHeader || !timestampHeader || !signatureHeader) {
      throw new UnauthorizedException({
        code: 'invalid_webhook_authentication',
        message: 'Cabeçalhos de autenticação inválidos.',
      });
    }

    const source = this.sourceConfig.find(sourceHeader);
    const timestamp = Number(timestampHeader);
    if (
      !source ||
      !/^\d+$/.test(timestampHeader) ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Math.floor(now.getTime() / 1000) - timestamp) >
        WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
    ) {
      throw new UnauthorizedException({
        code: 'invalid_webhook_authentication',
        message: 'Cabeçalhos de autenticação inválidos.',
      });
    }

    const expected = createHmac('sha256', source.secret)
      .update(`${timestampHeader}.`)
      .update(rawBody)
      .digest('hex');
    const received = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice('sha256='.length)
      : '';

    if (!/^[a-f0-9]{64}$/.test(received)) {
      throw new UnauthorizedException({
        code: 'invalid_webhook_authentication',
        message: 'Cabeçalhos de autenticação inválidos.',
      });
    }

    const isValid = timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(received, 'hex'),
    );
    if (!isValid) {
      throw new UnauthorizedException({
        code: 'invalid_webhook_authentication',
        message: 'Cabeçalhos de autenticação inválidos.',
      });
    }

    return sourceHeader;
  }
}
