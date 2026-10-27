import { Bookmark, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { PaperAction } from '../../api/researchApi'

type Rating = 'LIKE' | 'DISLIKE'

interface PaperFeedbackActionsProps {
  rating: Rating | null
  saved: boolean
  busy: PaperAction | null
  disabled: boolean
  onRate: (rating: Rating) => void
  onToggleSave: () => void
}

/** Paper-detail feedback only. The parent owns API calls and state. */
export default function PaperFeedbackActions({
  rating, saved, busy, disabled, onRate, onToggleSave,
}: PaperFeedbackActionsProps) {
  const inactive = disabled || busy !== null

  return (
    <section className="research-feedback-bar" aria-label="Paper feedback">
      <div className="research-feedback-intro">
        <span className="research-feedback-eyebrow">YOUR FEEDBACK</span>
        <span>Help Athena learn what's useful to you.</span>
      </div>
      <div className="research-feedback-actions">
        <button
          type="button"
          className={`research-feedback-button${rating === 'LIKE' ? ' is-active is-positive' : ''}`}
          aria-pressed={rating === 'LIKE'}
          disabled={inactive || rating === 'LIKE'}
          onClick={() => onRate('LIKE')}
          title={rating === 'LIKE' ? 'Already marked as relevant' : 'Mark as relevant'}
        >
          <ThumbsUp size={15} strokeWidth={1.7} />
          Relevant
        </button>
        <button
          type="button"
          className={`research-feedback-button${rating === 'DISLIKE' ? ' is-active is-negative' : ''}`}
          aria-pressed={rating === 'DISLIKE'}
          disabled={inactive || rating === 'DISLIKE'}
          onClick={() => onRate('DISLIKE')}
          title={rating === 'DISLIKE' ? 'Already marked as not relevant' : 'Mark as not relevant'}
        >
          <ThumbsDown size={15} strokeWidth={1.7} />
          Not relevant
        </button>
        <span className="research-feedback-separator" aria-hidden="true" />
        <button
          type="button"
          className={`research-feedback-button research-feedback-save${saved ? ' is-active is-saved' : ''}`}
          aria-pressed={saved}
          disabled={inactive}
          onClick={onToggleSave}
          title={saved ? 'Remove from saved papers' : 'Save this paper'}
        >
          <Bookmark size={15} strokeWidth={1.7} fill={saved ? 'currentColor' : 'none'} />
          {saved ? 'Saved' : 'Save paper'}
        </button>
      </div>
    </section>
  )
}
