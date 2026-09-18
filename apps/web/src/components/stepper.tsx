/** Олон алхамтай урсгалд хэрэглэгч хаана явааг харуулна */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label={steps.join(' → ')}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                state === 'todo' ? 'bg-slate-200 text-slate-500' : 'bg-brand-600 text-white'
              }`}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className={`truncate text-sm ${state === 'current' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
            {i < steps.length - 1 ? <span className={`h-px flex-1 ${i < current ? 'bg-brand-600' : 'bg-slate-200'}`} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
