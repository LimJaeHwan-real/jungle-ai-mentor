import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RagService } from './rag.service';

interface BlogCandidate {
  title: string;
  url: string;
  snippet?: string;
}

export interface BlogImportReference {
  type: 'BLOG_SEARCH';
  title: string;
  sourceUrl: string;
  snippet?: string;
  imported: boolean;
  status?: 'created' | 'updated' | 'skipped' | 'failed';
  documentId?: string;
  chunkCount?: number;
  reason?: string;
}

@Injectable()
export class BlogSearchService implements OnModuleInit, OnModuleDestroy {
  private syncTimer?: NodeJS.Timeout;
  private isSyncing = false;

  constructor(
    private readonly config: ConfigService,
    private readonly rag: RagService,
  ) {}

  async onModuleInit() {
    if (this.config.get<string>('BLOG_SYNC_ENABLED') !== 'true') return;

    const intervalHours = Number(this.config.get<string>('BLOG_SYNC_INTERVAL_HOURS') ?? 24);
    const intervalMs = Math.max(intervalHours, 1) * 60 * 60 * 1000;
    this.syncTimer = setInterval(() => {
      void this.syncJungleBlogs('scheduled');
    }, intervalMs);

    if (this.config.get<string>('BLOG_SYNC_RUN_ON_STARTUP') === 'true') {
      void this.syncJungleBlogs('startup');
    }
  }

  onModuleDestroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }

  async discoverAndImport(question: string) {
    const mode = this.config.get<string>('BLOG_SEARCH_MODE') ?? 'duckduckgo';
    if (mode === 'off') {
      return {
        mode,
        query: '',
        references: [],
        importedCount: 0,
        message: 'BLOG_SEARCH_MODE=off',
      };
    }

    const query = this.buildQuery(question);
    const maxResults = Number(this.config.get<string>('BLOG_SEARCH_MAX_RESULTS') ?? 3);
    const candidates = await this.search(query, maxResults);
    const references = await this.importCandidates(candidates, maxResults);

    return {
      mode,
      query,
      references,
      importedCount: references.filter((reference) => reference.imported).length,
    };
  }

  async syncJungleBlogs(trigger = 'manual', queries?: string[], maxResultsPerQuery?: number) {
    if (this.config.get<string>('BLOG_SEARCH_MODE') === 'off') {
      return {
        trigger,
        skipped: true,
        message: 'BLOG_SEARCH_MODE=off',
      };
    }

    if (this.isSyncing) {
      return {
        trigger,
        skipped: true,
        message: 'blog sync already running',
      };
    }

    this.isSyncing = true;
    const startedAt = new Date().toISOString();

    try {
      const syncQueries = queries?.length ? queries : this.getSyncQueries();
      const maxResults =
        maxResultsPerQuery ??
        Number(this.config.get<string>('BLOG_SYNC_MAX_RESULTS_PER_QUERY') ?? this.config.get<string>('BLOG_SEARCH_MAX_RESULTS') ?? 3);
      const seenUrls = new Set<string>();
      const references: BlogImportReference[] = [];

      for (const query of syncQueries) {
        const candidates = await this.search(query, maxResults);
        const uniqueCandidates = candidates.filter((candidate) => {
          const sourceUrl = this.normalizeUrl(candidate.url);
          if (!sourceUrl || seenUrls.has(sourceUrl)) return false;
          seenUrls.add(sourceUrl);
          return true;
        });
        references.push(...(await this.importCandidates(uniqueCandidates, maxResults)));
      }

      return {
        trigger,
        startedAt,
        finishedAt: new Date().toISOString(),
        queryCount: syncQueries.length,
        candidateCount: seenUrls.size,
        createdCount: references.filter((reference) => reference.status === 'created').length,
        updatedCount: references.filter((reference) => reference.status === 'updated').length,
        skippedCount: references.filter((reference) => reference.status === 'skipped').length,
        failedCount: references.filter((reference) => reference.status === 'failed').length,
        references,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private buildQuery(question: string) {
    const normalized = question.replace(/\s+/g, ' ').trim();
    return `크래프톤 정글 ${normalized} 블로그 후기`;
  }

  private async search(query: string, maxResults: number): Promise<BlogCandidate[]> {
    const mode = this.config.get<string>('BLOG_SEARCH_MODE') ?? 'duckduckgo';
    const naverClientId = this.config.get<string>('NAVER_CLIENT_ID');
    const naverClientSecret = this.config.get<string>('NAVER_CLIENT_SECRET');

    if (mode === 'naver_api' && naverClientId && naverClientSecret) {
      const naverResults = await this.searchNaverBlogs(query, maxResults, naverClientId, naverClientSecret);
      if (naverResults.length > 0) return naverResults;
    }

    return this.searchDuckDuckGo(query, maxResults);
  }

  private async importCandidates(candidates: BlogCandidate[], maxResults: number): Promise<BlogImportReference[]> {
    const references: BlogImportReference[] = [];

    for (const candidate of candidates.slice(0, maxResults)) {
      const sourceUrl = this.normalizeUrl(candidate.url);
      if (!sourceUrl || !this.isAllowedUrl(sourceUrl)) {
        references.push({
          type: 'BLOG_SEARCH',
          title: candidate.title,
          sourceUrl: candidate.url,
          snippet: candidate.snippet,
          imported: false,
          status: 'failed',
          reason: 'skipped_url',
        });
        continue;
      }

      const article = await this.fetchArticle(sourceUrl, candidate.title);
      if (!article.content || article.content.length < 500) {
        references.push({
          type: 'BLOG_SEARCH',
          title: article.title || candidate.title,
          sourceUrl,
          snippet: candidate.snippet,
          imported: false,
          status: 'failed',
          reason: 'content_too_short_or_blocked',
        });
        continue;
      }

      const document = await this.rag.indexDocument({
        title: article.title || candidate.title,
        content: article.content,
        category: 'BLOG',
        sourceType: 'BLOG_SEARCH',
        sourceUrl,
      });
      references.push({
        type: 'BLOG_SEARCH',
        title: document.title,
        sourceUrl,
        snippet: candidate.snippet,
        imported: document.status !== 'skipped',
        status: document.status,
        documentId: document.id,
        chunkCount: document.chunkCount,
        reason: document.status === 'skipped' ? 'already_indexed_same_content' : undefined,
      });
    }

    return references;
  }

  private getSyncQueries() {
    const configured = this.config.get<string>('BLOG_SYNC_QUERIES');
    if (configured) {
      return configured
        .split('|')
        .map((query) => query.trim())
        .filter(Boolean);
    }

    return [
      '크래프톤 정글 후기 블로그',
      '크래프톤 정글 지원 후기 블로그',
      '크래프톤 정글 알고리즘 학습 블로그',
      '크래프톤 정글 입학 준비 블로그',
      '크래프톤 정글 회고 블로그',
    ];
  }

  private async searchNaverBlogs(query: string, maxResults: number, clientId: string, clientSecret: string) {
    try {
      const url = new URL('https://openapi.naver.com/v1/search/blog.json');
      url.searchParams.set('query', query);
      url.searchParams.set('display', String(maxResults));
      url.searchParams.set('sort', 'sim');

      const response = await this.fetchWithTimeout(url.toString(), {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });
      if (!response.ok) return [];

      const data = (await response.json()) as {
        items?: Array<{ title: string; link: string; description?: string }>;
      };

      return (
        data.items?.map((item) => ({
          title: this.cleanText(item.title),
          url: item.link,
          snippet: item.description ? this.cleanText(item.description) : undefined,
        })) ?? []
      );
    } catch {
      return [];
    }
  }

  private async searchDuckDuckGo(query: string, maxResults: number) {
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) return [];
      const html = await response.text();
      const results: BlogCandidate[] = [];
      const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let match: RegExpExecArray | null;

      while ((match = resultRegex.exec(html)) && results.length < maxResults) {
        const candidateUrl = this.decodeDuckDuckGoUrl(this.decodeHtml(match[1]));
        results.push({
          title: this.cleanText(match[2]),
          url: candidateUrl,
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  private async fetchArticle(sourceUrl: string, fallbackTitle: string) {
    const firstHtml = await this.fetchHtml(sourceUrl);
    const frameUrl = this.extractNaverFrameUrl(firstHtml, sourceUrl);
    const html = frameUrl ? await this.fetchHtml(frameUrl) : firstHtml;

    return {
      title: this.extractTitle(html) || fallbackTitle,
      content: this.extractReadableText(html),
    };
  }

  private async fetchHtml(url: string) {
    const response = await this.fetchWithTimeout(url);
    if (!response.ok) return '';
    const html = await response.text();
    return html.slice(0, 2_000_000);
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
          ...(init.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractNaverFrameUrl(html: string, baseUrl: string) {
    const frameMatch = html.match(/<iframe[^>]+id=["']mainFrame["'][^>]+src=["']([^"']+)["']/i);
    if (!frameMatch?.[1]) return undefined;
    try {
      return new URL(frameMatch[1], baseUrl).toString();
    } catch {
      return undefined;
    }
  }

  private extractTitle(html: string) {
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const title = ogTitle ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return title ? this.cleanText(title) : '';
  }

  private extractReadableText(html: string) {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    return this.cleanText(
      body
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
        .replace(/<header[\s\S]*?<\/header>/gi, ' ')
        .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    );
  }

  private cleanText(value: string) {
    return this.decodeHtml(value)
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  private decodeHtml(value: string) {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
  }

  private decodeDuckDuckGoUrl(url: string) {
    try {
      const parsed = new URL(url, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : parsed.toString();
    } catch {
      return url;
    }
  }

  private normalizeUrl(url: string) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return undefined;
    }
  }

  private isAllowedUrl(url: string) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === 'localhost' || host.endsWith('.local')) return false;
      if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
      return true;
    } catch {
      return false;
    }
  }
}
