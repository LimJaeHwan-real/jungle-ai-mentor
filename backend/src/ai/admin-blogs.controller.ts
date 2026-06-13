import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BlogSearchService } from './blog-search.service';
import { SyncBlogsDto } from './dto/sync-blogs.dto';

@Controller('admin/blogs')
@UseGuards(JwtAuthGuard)
export class AdminBlogsController {
  constructor(private readonly blogSearch: BlogSearchService) {}

  @Post('sync')
  sync(@Body() dto: SyncBlogsDto) {
    return this.blogSearch.syncJungleBlogs('manual', dto.queries, dto.maxResultsPerQuery);
  }
}
