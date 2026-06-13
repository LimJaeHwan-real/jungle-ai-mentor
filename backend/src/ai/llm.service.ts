import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AnswerContext {
  title: string;
  content: string;
  category?: string;
  sourceUrl?: string;
}

@Injectable()
export class LlmService {
  constructor(private readonly config: ConfigService) {}

  async answer(question: string, contexts: AnswerContext[] = [], extraInstruction?: string) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return this.mockAnswer(question, contexts, extraInstruction);
    }

    const contextText = contexts
      .map((context, index) => {
        const source = context.sourceUrl ? `\n출처: ${context.sourceUrl}` : '';
        return `[${index + 1}] ${context.title}${source}\n${context.content}`;
      })
      .join('\n\n');

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a concise Korean AI mentor for Jungle learners. Use provided context first, cite useful source titles and URLs when present, and say when evidence is limited.',
            },
            {
              role: 'user',
              content: `질문: ${question}\n\n참고 컨텍스트:\n${contextText || '없음'}\n\n추가 지시: ${extraInstruction ?? '없음'}`,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        return this.mockAnswer(question, contexts, extraInstruction);
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? this.mockAnswer(question, contexts, extraInstruction);
    } catch {
      return this.mockAnswer(question, contexts, extraInstruction);
    }
  }

  private mockAnswer(question: string, contexts: AnswerContext[], extraInstruction?: string) {
    if (contexts.length === 0) {
      return [
        `질문 "${question}"에 대한 데모 답변입니다.`,
        '현재 OPENAI_API_KEY가 없어 mock LLM으로 응답했습니다.',
        extraInstruction ? `추가 맥락: ${extraInstruction}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const references = contexts
      .slice(0, 3)
      .map((context, index) => `${index + 1}. ${context.title}: ${context.content.slice(0, 180)}`)
      .join('\n');

    return [
      `질문 "${question}"에 대해 등록된 지식 베이스를 우선 참고했습니다.`,
      references,
      '실제 OpenAI 키를 설정하면 위 근거를 바탕으로 더 자연스러운 답변이 생성됩니다.',
    ].join('\n\n');
  }
}
