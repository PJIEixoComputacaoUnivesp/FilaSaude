import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BoundariesModule } from './boundaries/boundaries.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/data-source.js';
import { OccupancyModule } from './occupancy/occupancy.module.js';
import { UnitsModule } from './units/units.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions),
    BoundariesModule,
    UnitsModule,
    OccupancyModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
