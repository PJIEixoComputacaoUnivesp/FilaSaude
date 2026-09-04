import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'fila-saude-api',
      status: 'ok',
    } as const;
  }
}
