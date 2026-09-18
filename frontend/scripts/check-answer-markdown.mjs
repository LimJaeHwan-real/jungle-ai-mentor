import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  // The short-lived test server does not need to scan index.html in the background.
  optimizeDeps: { noDiscovery: true },
});

try {
  const { AnswerMarkdown } = await server.ssrLoadModule('/src/components/AnswerMarkdown.tsx');
  const { answerStatusLabel } = await server.ssrLoadModule('/src/utils/answer-status.ts');
  const render = (answer, references) => renderToStaticMarkup(
    React.createElement(AnswerMarkdown, { answer, references }),
  );

  await test('질문 및 FAQ 답변의 Markdown 제목·목록·표·코드를 표시한다', () => {
    const html = render('## 안내\n\n- 첫째\n\n| 단계 | 설명 |\n| --- | --- |\n| 1 | 시작 |\n\n`코드`');
    assert.match(html, /<h2>안내<\/h2>/);
    assert.match(html, /<li>첫째<\/li>/);
    assert.match(html, /<table>/);
    assert.match(html, /<code>코드<\/code>/);
  });

  await test('실제 인용 위치를 출처 링크로 표시한다', () => {
    const answer = '블로그 후기 [1]';
    const startIndex = answer.indexOf('[1]');
    const html = render(answer, [
      { startIndex, endIndex: startIndex + 3, sourceUrl: 'https://example.org/blog/one' },
      { startIndex, endIndex: startIndex + 3, sourceUrl: 'https://example.org/blog/two' },
    ]);
    assert.match(html, /href="https:\/\/example\.org\/blog\/one"/);
    assert.match(html, /href="https:\/\/example\.org\/blog\/two"/);
    assert.match(html, /rel="noopener noreferrer"/);
  });

  await test('검증된 FAQ 근거 번호를 내부 FAQ 상세 링크로 표시한다', () => {
    const html = render('가상 메모리를 공부하세요. [1]', [{ faqId: 'faq-1' }]);
    assert.match(html, /href="\/faq\/faq-1"/);
    assert.match(html, /가상 메모리를 공부하세요/);
  });

  await test('외부 이미지와 HTML, 실행 가능한 주소를 렌더링하지 않는다', () => {
    const html = render('![그림](https://example.org/track.png) <script>alert(1)</script> [링크](javascript:alert(1))');
    assert.doesNotMatch(html, /<img|<script|href="javascript:/);
    assert.match(html, /그림/);
  });

  await test('근거 없음과 검색 장애를 서로 다른 답변 상태로 표시한다', () => {
    assert.equal(answerStatusLabel('NO_EVIDENCE'), '답할 근거 없음');
    assert.equal(answerStatusLabel('WEB_SEARCH_FAILED'), '웹 검색 실패');
    assert.equal(answerStatusLabel('NO_ACTIVE_INDEX'), '활성 색인 없음');
    assert.equal(answerStatusLabel('INTERNAL_SEARCH_FAILED'), '내부 검색 장애');
    assert.equal(answerStatusLabel('INTERNAL_EVIDENCE'), '내부 근거 답변');
    assert.equal(answerStatusLabel('WEB_EVIDENCE'), '웹 근거 답변');
  });
} finally {
  await server.close();
}
