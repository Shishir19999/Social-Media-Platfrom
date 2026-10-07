import { Link } from 'react-router-dom'
import { tokenize } from '../lib/richtext'

/** Renders post/comment text with clickable #hashtags, @mentions and links. */
export default function RichText({ text, className = '' }) {
  return (
    <p className={`rich-text ${className}`}>
      {tokenize(text).map((t, i) => {
        if (t.type === 'tag') return <Link key={i} to={`/tag/${encodeURIComponent(t.tag)}`} className="tag-link">{t.value}</Link>
        if (t.type === 'mention') return <Link key={i} to={`/u/${t.username}`} className="mention-link">{t.value}</Link>
        if (t.type === 'url') return <a key={i} href={t.value} target="_blank" rel="noreferrer noopener" className="ext-link">{t.value}</a>
        return t.value
      })}
    </p>
  )
}
