import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/data-source.js';
import { UnitsModule } from './units/units.module.js';

@Module({
  imports: [TypeOrmModule.forRoot(databaseOptions), UnitsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
