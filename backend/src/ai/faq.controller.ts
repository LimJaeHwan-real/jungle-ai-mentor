import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListFaqDto } from './dto/list-faq.dto';
import { FaqService } from './faq.service';

@Controller('faq')
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @Get()
  list(@Query() query: ListFaqDto) {
    return this.faqService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.faqService.get(id);
  }
}

