#!/usr/bin/env node

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ingestionHelp,
  parseIngestionArguments,
} from './ingestion/ingestion-cli.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import {
  UnitsIngestionError,
  UnitsIngestionService,
} from './ingestion/units-ingestion.service.js';

async function main(): Promise<void> {
  const arguments_ = parseIngestionArguments(process.argv.slice(2));
  if (arguments_.help) {
    console.log(ingestionHelp());
    return;
  }

  const application = await NestFactory.createApplicationContext(
    IngestionModule,
    { logger: ['log', 'warn', 'error'] },
  );
  try {
    await application.get(UnitsIngestionService).run(arguments_.states);
  } finally {
    await application.close();
  }
}

main().catch((error: unknown) => {
  const logger = new Logger('UnitsIngestionCommand');
  if (error instanceof UnitsIngestionError) {
    logger.error(
      `Ingestão incompleta: ${error.failures.map(({ state, reason }) => `${state} (${reason})`).join(', ')}`,
    );
  } else {
    logger.error(error instanceof Error ? error.message : 'Erro inesperado');
  }
  process.exitCode = 1;
});
