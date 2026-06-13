import { X } from 'lucide-react';
import { KeyboardEvent, useState } from 'react';

export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const tag = draft.trim().replace(/^#/, '').toLowerCase();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    }
  }

  return (
    <div className="tag-input">
      <div className="tag-row">
        {value.map((tag) => (
          <button key={tag} className="tag-pill removable" type="button" onClick={() => onChange(value.filter((item) => item !== tag))}>
            #{tag} <X size={13} />
          </button>
        ))}
      </div>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={addTag} onKeyDown={onKeyDown} placeholder="태그 입력 후 Enter" />
    </div>
  );
}

