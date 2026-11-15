import { Activity, ArrowLeft, ArrowRight } from 'lucide-react';
import { EVEA_LABELS } from './eveaItems';

export default function EveaOnboarding({ answers, index, onAnswer, onIndex, onBack, onFinish, submitting, error }) {
  const item = EVEA_LABELS[index];
  const selected = answers[index];
  const answered = answers.filter((value) => Number.isInteger(value)).length;
  const complete = answers.every((value) => Number.isInteger(value) && value >= 0 && value <= 10);
  const last = index === EVEA_LABELS.length - 1;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F2F2F7] px-5 py-10 text-slate-900">
      <section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="mb-8 flex items-center gap-2 text-xs font-semibold tracking-[0.15em] text-slate-500">
          <Activity className="h-4 w-4" /> Ridge Support System
        </div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Step 2 of 2 · EVEA HMM</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Mood check-in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">How much do you feel this way right now?</p>
        <div className="mt-6 flex justify-between text-xs text-slate-400">
          <span>Question {index + 1} of {EVEA_LABELS.length}</span>
          <span>{answered} answered</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${answered / EVEA_LABELS.length * 100}%` }} />
        </div>
        <h2 className="mt-8 text-xl font-semibold">{item.label.replace(/^p\d+\s*•\s*/, '')}</h2>
        <p className="mt-1 text-xs text-slate-400">{item.dim}</p>
        <fieldset disabled={submitting} className="mt-6">
          <legend className="sr-only">Choose a score from 0 to 10</legend>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 11 }, (_, value) => (
              <button key={value} type="button" aria-pressed={selected === value}
                onClick={() => onAnswer(index, value)}
                className={`rounded-xl border py-3 text-sm font-semibold transition ${selected === value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {value}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs text-slate-400"><span>0 · Not at all</span><span>10 · Very much</span></div>
        </fieldset>
        {error && <p role="alert" className="mt-5 text-sm text-amber-800">{error}</p>}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" disabled={submitting} onClick={() => index ? onIndex(index - 1) : onBack()}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-slate-500 disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button type="button" disabled={submitting || !Number.isInteger(selected) || (last && !complete)}
            onClick={() => last ? onFinish() : onIndex(index + 1)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? 'Connecting…' : last ? 'Finish & connect watch' : 'Next'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-400">Your completed answers will be available in the EVEA HMM tab.</p>
      </section>
    </main>
  );
}
