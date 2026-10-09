import { HttpException, type HttpStatus } from '@nestjs/common';

export interface WebhookErrorResponse {
  code: string;
  message: string;
  fields?: string[];
}

export class WebhookRequestException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    fields?: string[],
  ) {
    const response: WebhookErrorResponse = { code, message };
    if (fields && fields.length > 0) response.fields = fields;
    super(response, status);
  }
}
