import { ArrowLeft, BookOpenText } from 'lucide-react'
import { splitParagraphs } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

/** Long-form synopsis with preserved paragraphs and a back-to-information action. */
export function SynopsisPanel({
  text,
  title,
  label = 'Synopsis',
  onBack,
}: {
  text: string | null | undefined
  title: string
  label?: string
  onBack: () => void
}) {
  const paragraphs = splitParagraphs(text)
  return (
    <div>
      {paragraphs.length ? (
        <article className="max-w-[68ch]">
          <p className="mb-4 text-xs font-semibold tracking-[0.14em] text-muted uppercase">{label}</p>
          <div className="prose-reading text-[15.5px] leading-[1.85] text-ink sm:text-base">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </article>
      ) : (
        <EmptyState
          compact
          icon={BookOpenText}
          title={`No ${label.toLowerCase()} yet`}
          description={`A ${label.toLowerCase()} for “${title}” hasn't been added to the catalog.`}
        />
      )}
      <Button variant="ghost" className="mt-6 -ml-2" onClick={onBack} leftIcon={<ArrowLeft className="size-4" />}>
        Back to information
      </Button>
    </div>
  )
}
