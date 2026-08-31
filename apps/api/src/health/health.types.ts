export type HealthComponentStatus = 'ok' | 'error' | 'skipped';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: HealthComponentStatus;
  redis: HealthComponentStatus;
  minio?: HealthComponentStatus;
  host?: string;
  uptimeSec?: number;
}
