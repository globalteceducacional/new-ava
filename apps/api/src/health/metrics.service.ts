import { Injectable } from '@nestjs/common';
import { hostname } from 'os';

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();

  snapshot() {
    const mem = process.memoryUsage();
    return {
      service: 'ava-api',
      host: hostname(),
      pid: process.pid,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      node: process.version,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
