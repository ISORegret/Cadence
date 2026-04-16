import { useFinanceStore } from '../store/financeStore'

type PageUndoProps = {
  className?: string
}

/** Undo last persisted data change — place on pages with editable cards. */
export function PageUndo({ className = '' }: PageUndoProps) {
  const undoSnapshots = useFinanceStore((s) => s.undoSnapshots)
  const undoLast = useFinanceStore((s) => s.undoLast)
  const disabled = undoSnapshots.length === 0

  return (
    <button
      type="button"
      onClick={() => undoLast()}
      disabled={disabled}
      title="Undo last change to bills, budgets, expenses, notes, etc."
      className={[
        'btn-secondary shrink-0 text-xs !min-h-9 !px-3 !py-2 sm:text-sm',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Undo
    </button>
  )
}
