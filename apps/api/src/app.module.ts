import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UnitsModule } from './units/units.module.js';

@Module({
  imports: [UnitsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
