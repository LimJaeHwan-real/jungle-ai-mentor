import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListFaqDto } from './dto/list-faq.dto';
import { PublishFaqDto } from './dto/publish-faq.dto';
import { AiQuestion } from './entities/ai-question.entity';
import { Faq } from './entities/faq.entity';

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

  async searchForAgent(keyword: string, limit = 3) {
    const qb = this.faqs
      .createQueryBuilder('faq')
      .where('(faq.title ILIKE :keyword OR faq.question ILIKE :keyword OR faq.answer ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      })
      .orderBy('faq.viewCount', 'DESC')
      .take(limit);

    const faqs = await qb.getMany();
    return faqs.map((faq) => ({
      title: faq.title,
      content: `${faq.question}\n${faq.answer}`,
      category: faq.category,
    }));
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

