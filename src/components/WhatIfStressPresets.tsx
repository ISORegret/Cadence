export function WhatIfStressPresets({
  periodIncome,
  setWhatIfIncomeAdj,
  setWhatIfDueAdj,
}: {
  periodIncome: number | null
  setWhatIfIncomeAdj: (v: number) => void
  setWhatIfDueAdj: (v: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Stress presets
      </span>
      <button
        type="button"
        className="btn-secondary !py-1.5 text-xs"
        onClick={() => {
          setWhatIfDueAdj(0)
          setWhatIfIncomeAdj(0)
        }}
      >
        Reset
      </button>
      {periodIncome !== null && periodIncome > 0 ? (
        <>
          <button
            type="button"
            className="btn-secondary !py-1.5 text-xs"
            onClick={() =>
              setWhatIfIncomeAdj(-Math.round(periodIncome * 0.1 * 100) / 100)
            }
          >
            −10% income
          </button>
          <button
            type="button"
            className="btn-secondary !py-1.5 text-xs"
            onClick={() =>
              setWhatIfIncomeAdj(-Math.round(periodIncome * 0.25 * 100) / 100)
            }
          >
            −25% income
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="btn-secondary !py-1.5 text-xs"
        onClick={() => setWhatIfDueAdj(100)}
      >
        +$100 still due
      </button>
    </div>
  )
}
