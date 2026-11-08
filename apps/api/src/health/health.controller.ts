import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
