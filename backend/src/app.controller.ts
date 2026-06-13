import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  health() {
    return {
      ok: true,
      service: 'jungle-ai-mentor-api',
      timestamp: new Date().toISOString(),
    };
  }
}

