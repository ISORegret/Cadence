import { useMemo } from 'react'
import { categoryFillHex } from '../lib/categoryColors'

const MAX_SLICES = 8
const TOP_N_BEFORE_OTHER = 7

type Segment = { name: string; amount: number }

function mergeForDonut(sorted: [string, number][]): Segment[] {
  if (sorted.length <= MAX_SLICES) {
    return sorted.map(([name, amount]) => ({ name, amount }))
  }
  const head = sorted.slice(0, TOP_N_BEFORE_OTHER).map(([name, amount]) => ({
    name,
    amount,
  }))
  const tail = sorted.slice(TOP_N_BEFORE_OTHER)
  const other = tail.reduce((s, [, a]) => s + a, 0)
  return [...head, { name: 'Other', amount: other }]
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  }
}

function annularSector(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const span = endAngle - startAngle
  if (span <= 0) return ''
  const largeArc = span > Math.PI ? 1 : 0
  const p1 = polar(cx, cy, rOuter, startAngle)
  const p2 = polar(cx, cy, rOuter, endAngle)
  const p3 = polar(cx, cy, rInner, endAngle)
  const p4 = polar(cx, cy, rInner, startAngle)
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ')
}

function segmentFill(name: string): string {
  if (name === 'Other') return '#64748b'
  return categoryFillHex(name)
}

type SlicePath = Segment & { d: string; key: string }

type CategorySpendDonutProps = {
  /** Highest amounts first (e.g. from category totals). */
  sortedEntries: [string, number][]
  formatMoney: (n: number) => string
}

export function CategorySpendDonut({
  sortedEntries,
  formatMoney,
}: CategorySpendDonutProps) {
  const segments = useMemo(
    () => mergeForDonut(sortedEntries),
    [sortedEntries],
  )

  const total = segments.reduce((s, x) => s + x.amount, 0)
  const cx = 100
  const cy = 100
  const rOuter = 86
  const rInner = 54

  const { singleRing, slicePaths } = useMemo(() => {
    if (total <= 0 || segments.length === 0) {
      return { singleRing: null as Segment | null, slicePaths: [] as SlicePath[] }
    }
    if (segments.length === 1) {
      return { singleRing: segments[0]!, slicePaths: [] as SlicePath[] }
    }
    let angle = -Math.PI / 2
    const paths: SlicePath[] = segments.map((seg) => {
      const sweep = (seg.amount / total) * Math.PI * 2
      const start = angle
      const end = angle + sweep
      angle = end
      return {
        ...seg,
        key: seg.name,
        d: annularSector(cx, cy, rOuter, rInner, start, end),
      }
    })
    return { singleRing: null as Segment | null, slicePaths: paths }
  }, [segments, total])

  if (total <= 0) return null

  const rMid = (rOuter + rInner) / 2
  const strokeW = rOuter - rInner

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 200"
        className="h-44 w-44 text-slate-800 dark:text-slate-100"
        role="img"
        aria-label="Spending share by category this period"
      >
        <title>Spending share by category this period</title>
        {singleRing ? (
          <circle
            cx={cx}
            cy={cy}
            r={rMid}
            fill="none"
            stroke={segmentFill(singleRing.name)}
            strokeWidth={strokeW}
          >
            <title>{`${singleRing.name}: ${formatMoney(singleRing.amount)} (100%)`}</title>
          </circle>
        ) : (
          slicePaths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill={segmentFill(p.name)}
              stroke="rgb(255 255 255 / 0.35)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              className="dark:stroke-zinc-950/40"
            >
              <title>{`${p.name}: ${formatMoney(p.amount)} (${Math.round((p.amount / total) * 100)}%)`}</title>
            </path>
          ))
        )}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-current text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          Total
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-current text-sm font-bold tabular-nums"
        >
          {formatMoney(total)}
        </text>
      </svg>
      <p className="max-w-[11rem] text-center text-[10px] leading-snug text-slate-500 dark:text-slate-400">
        Hover slices for amounts.
        {sortedEntries.length > MAX_SLICES ? (
          <>
            {' '}
            More than {MAX_SLICES} categories group as{' '}
            <span className="font-medium text-slate-600 dark:text-slate-300">
              Other
            </span>
            .
          </>
        ) : null}
      </p>
    </div>
  )
}
