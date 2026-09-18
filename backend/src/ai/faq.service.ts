import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListFaqDto } from './dto/list-faq.dto';
import { PublishFaqDto } from './dto/publish-faq.dto';
import { AiQuestion } from './entities/ai-question.entity';
import { Faq } from './entities/faq.entity';
import type { RagSearchResult } from './rag.service';

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(AiQuestion) private readonly questions: Repository<AiQuestion>,
    @InjectRepository(Faq) private readonly faqs: Repository<Faq>,
  ) {}

  async publish(questionId: string, dto: PublishFaqDto) {
    const question = await this.questions.findOne({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundException('AI question not found.');
    }
    if (question.usedTools?.some((tool) => ['BLOG_SEARCH_TOOL', 'WEB_SEARCH_TOOL', 'GITHUB_MCP_TOOL'].includes(tool))) {
      throw new ForbiddenException('외부 자료를 사용한 답변은 FAQ로 공개할 수 없습니다.');
    }

    const existing = await this.faqs.findOne({ where: { aiQuestionId: questionId } });
    if (existing) {
      throw new ConflictException('This answer is already published.');
    }

    question.isPublic = true;
    await this.questions.save(question);

    const faq = await this.faqs.save(
      this.faqs.create({
        aiQuestionId: question.id,
        title: dto.title ?? this.toTitle(question.question),
        question: question.question,
        answer: question.answer,
        category: dto.category ?? String(question.agentRoute),
      }),
    );
    return this.serialize(faq);
  }

  async list(query: ListFaqDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const qb = this.faqs
      .createQueryBuilder('faq')
      .orderBy('faq.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.keyword) {
      qb.andWhere('(faq.title ILIKE :keyword OR faq.question ILIKE :keyword OR faq.answer ILIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.category) {
      qb.andWhere('faq.category = :category', { category: query.category });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((faq) => this.serialize(faq)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async get(id: string) {
    const faq = await this.faqs.findOne({ where: { id } });
    if (!faq) {
      throw new NotFoundException('FAQ not found.');
    }
    await this.faqs.increment({ id }, 'viewCount', 1);
    faq.viewCount += 1;
    return this.serialize(faq);
  }

  async searchForAgent(keyword: string, limit = 3): Promise<RagSearchResult[]> {
    const terms = [...new Set(keyword.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter((term) => term.length >= 2))].slice(0, 8);
    if (terms.length === 0) return [];

    const termClauses = terms.map((_, index) =>
      `(faq.title ILIKE :faqTerm${index} OR faq.question ILIKE :faqTerm${index} OR faq.answer ILIKE :faqTerm${index})`);
    const params = Object.fromEntries(terms.map((term, index) => [`faqTerm${index}`, `%${term}%`]));
    const faqs = await this.faqs.createQueryBuilder('faq')
      .innerJoinAndSelect('faq.aiQuestion', 'question')
      .where(`question."agentState" ->> 'trustedInternalEvidence' = 'true'`)
      .andWhere(`NOT (question."usedTools" ?| ARRAY['BLOG_SEARCH_TOOL', 'WEB_SEARCH_TOOL', 'GITHUB_MCP_TOOL']::text[])`)
      .andWhere(`(${termClauses.join(' OR ')})`, params)
      .orderBy('faq.viewCount', 'DESC')
      .take(20)
      .getMany();

    return faqs
      .filter((faq) => faq.aiQuestion?.agentState?.trustedInternalEvidence === true
        && !faq.aiQuestion.usedTools?.some((tool) => ['BLOG_SEARCH_TOOL', 'WEB_SEARCH_TOOL', 'GITHUB_MCP_TOOL'].includes(tool)))
      .map((faq) => {
        const chunkText = `${faq.question}\n${faq.answer}`;
        const searchable = `${faq.title} ${chunkText}`.toLowerCase();
        return {
          faqId: faq.id,
          chunkId: `faq:${faq.id}`,
          documentId: `faq:${faq.id}`,
          title: faq.title,
          chunkText,
          category: 'FAQ',
          score: terms.filter((term) => searchable.includes(term)).length / terms.length,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private toTitle(question: string) {
    return question.length > 40 ? `${question.slice(0, 40)}...` : question;
  }

  private serialize(faq: Faq) {
    return {
      id: faq.id,
      title: faq.title,
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      viewCount: faq.viewCount,
      likeCount: faq.likeCount,
      createdAt: faq.createdAt,
      updatedAt: faq.updatedAt,
    };
  }
}
