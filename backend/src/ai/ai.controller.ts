import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { AgentService } from './agent.service';
import { AskAiDto } from './dto/ask-ai.dto';
import { PublishFaqDto } from './dto/publish-faq.dto';
import { FaqService } from './faq.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly agentService: AgentService,
    private readonly faqService: FaqService,
  ) {}

  @Post('ask')
  ask(@CurrentUser() user: User, @Body() dto: AskAiDto) {
    return this.agentService.ask(user, dto);
  }

  @Post('questions/:id/publish')
  publish(@Param('id') id: string, @Body() dto: PublishFaqDto) {
    return this.faqService.publish(id, dto);
  }
}

