import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UnitsModule } from './units/units.module.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/data-source.js';

const databaseImports =
  process.env.NODE_ENV === 'test'
    ? []
    : [TypeOrmModule.forRoot(databaseOptions)];

@Module({
  imports: [...databaseImports, UnitsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
