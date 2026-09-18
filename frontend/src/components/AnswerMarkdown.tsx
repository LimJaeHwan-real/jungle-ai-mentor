import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AiReference } from '../types';

interface AnswerMarkdownProps {
  answer: string;
  references?: AiReference[];
}

export function publicUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeHref(value?: string) {
  if (value && /^\/faq\/[A-Za-z0-9_-]+$/.test(value)) return value;
  return publicUrl(value);
}

function citationMarkdown(answer: string, references: AiReference[]) {
  const grouped = new Map<string, { start: number; end: number; links: Array<{ index: number; url: string }> }>();
  references.forEach((reference, index) => {
    const { startIndex: start, endIndex: end } = reference;
    const url = publicUrl(reference.sourceUrl);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start === undefined || end === undefined
      || !url || start < 0 || end <= start || end > answer.length) return;
    const key = `${start}:${end}`;
    const group = grouped.get(key) ?? { start, end, links: [] };
    group.links.push({ index, url });
    grouped.set(key, group);
  });
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const index = Number(match[1]) - 1;
    const faqId = references[index]?.faqId;
    if (!faqId || !/^[A-Za-z0-9_-]+$/.test(faqId) || match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    const key = `${start}:${end}`;
    const group = grouped.get(key) ?? { start, end, links: [] };
    group.links.push({ index, url: `/faq/${faqId}` });
    grouped.set(key, group);
  }

  let result = '';
  let cursor = 0;
  for (const group of [...grouped.values()].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (group.start < cursor) continue;
    result += answer.slice(cursor, group.start);
    result += group.links.map(({ index, url }, linkIndex) => {
      const label = linkIndex === 0 ? answer.slice(group.start, group.end) : `[${index + 1}]`;
      const escapedLabel = label.replace(/[\\[\]]/g, '\\$&');
      const escapedUrl = url.replace(/[<>]/g, (character) => encodeURIComponent(character));
      return `[${escapedLabel}](<${escapedUrl}>)`;
    }).join(' ');
    cursor = group.end;
  }
  return result + answer.slice(cursor);
}

export function AnswerMarkdown({ answer, references = [] }: AnswerMarkdownProps) {
  return (
    <div className="answer-box">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const url = safeHref(href);
            return url ? <a href={url} target={url.startsWith('/faq/') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
          },
          img: ({ alt }) => <span>{alt ?? ''}</span>,
        }}
      >
        {citationMarkdown(answer, references)}
      </ReactMarkdown>
    </div>
  );
}
