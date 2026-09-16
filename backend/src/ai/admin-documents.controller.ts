import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminEmailGuard } from '../auth/admin-email.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { RagService } from './rag.service';

@Controller('admin/documents')
@UseGuards(JwtAuthGuard, AdminEmailGuard)
export class AdminDocumentsController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.ragService.createDocument(dto);
  }
}

