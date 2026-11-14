import type { CoachAnswerResponse } from '@nestmint/shared';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/** NM-80: ask a question in plain words; the answer comes with why and the numbers it rests on. */
export function AskCoach() {
  const { authedSend } = useAuth();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<CoachAnswerResponse | null>(null);
  const [failed, setFailed] = useState(false);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (question.trim().length < 2) return;
    setFailed(false);
    try {
      setAnswer(await authedSend<CoachAnswerResponse>('POST', '/coach/ask', { question }));
    } catch {
      setFailed(true);
    }
  }

  return (
    <section aria-label="Ask the coach" className="mt-6 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">Ask the coach</h2>
      <form onSubmit={ask} className="mt-2 flex gap-2">
        <input
          aria-label="Your question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Where can I save more?"
          className="min-w-0 flex-1 rounded border px-2 py-1"
        />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Ask
        </button>
      </form>
      {failed && <p className="mt-2 text-red-700">The coach could not answer. Try again.</p>}
      {answer && (
        <div className="mt-3">
          <p>{answer.answer}</p>
          <p className="mt-1 text-gray-600">Why: {answer.why}</p>
          {answer.facts.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-gray-500">
              {answer.facts.map((f) => (
                <li key={f.text}>{f.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
