import { createHmac } from 'node:crypto';

export function signSnapshot(
  sourceSecret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac('sha256', sourceSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}
