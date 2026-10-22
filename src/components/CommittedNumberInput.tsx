'use client';

import { useState } from 'react';

export function CommittedNumberInput({ id, label, value, min, max, disabled, describedBy, onCommit }: {
  id: string; label: string; value: number; min: number; max: number; disabled?: boolean;
  describedBy?: string; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState({ base: value, text: String(value), error: '' });
  // A slider, reset or source replacement supersedes any draft based on an older value.
  let current = draft;
  if (draft.base !== value) {
    current = { base: value, text: String(value), error: '' };
    setDraft(current);
  }
  const commit = () => {
    if (current.error) return; // Keep restored-value guidance until the user edits or an external value replaces it.
    const number = Number(current.text);
    if (current.text.trim() === '' || !Number.isInteger(number) || number < min || number > max) {
      setDraft({ base: value, text: String(value), error: `Enter a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}. Restored ${value.toLocaleString('en-US')}.` });
      return;
    }
    setDraft({ base: number, text: String(number), error: '' });
    onCommit(number);
  };
  return <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
    <input id={id} type="number" min={min} max={max} step="1" disabled={disabled}
      value={current.text} aria-invalid={current.error ? true : undefined}
      aria-describedby={[describedBy, current.error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
      onChange={event => setDraft({ base: value, text: event.target.value, error: '' })}
      onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
      className="block w-full min-h-11 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300" />
    {current.error && <p id={`${id}-error`} className="mt-2 text-sm text-red-300">{current.error}</p>}
  </div>;
}
