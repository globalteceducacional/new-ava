import { Controller, Get } from '@nestjs/common';
import { hostname } from 'os';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Snapshot leve para monitoramento (uptime, memória, processo). */
  @Get()
  getMetrics() {
    return this.metrics.snapshot();
  }

  @Get('ping')
  ping() {
    return { ok: true, host: hostname() };
  }
}
