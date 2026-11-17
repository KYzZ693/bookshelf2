import { Fragment, memo } from 'react'

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Highlights every occurrence of the query's words (case-insensitive). */
export const Highlight = memo(function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 1)
    .map(escapeRegExp)
  if (!words.length || !text) return <>{text}</>
  const re = new RegExp(`(${words.join('|')})`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[3px] bg-want-soft px-px text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
})
