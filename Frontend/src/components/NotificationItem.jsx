import { Link } from 'react-router-dom'
import { timeAgo } from '../lib/format'
import Avatar from './Avatar'
import Icon from './Icon'

const TEXT = {
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  mention: 'mentioned you',
  follow: 'started following you',
}
const ICON = { like: 'heart', comment: 'message', reply: 'reply', mention: 'hash', follow: 'user' }

export default function NotificationItem({ n, onNavigate }) {
  const to = n.postId ? `/post/${n.postId}` : `/u/${n.actor.username}`
  return (
    <li>
      <Link to={to} className={`notif ${n.read ? '' : 'notif-unread'}`} onClick={onNavigate}>
        <span className={`notif-icon notif-${n.type}`}><Icon name={ICON[n.type] || 'bell'} size={16} /></span>
        <Avatar user={n.actor} size={36} />
        <span className="grow min0">
          <span><strong>{n.actor.displayName}</strong> {TEXT[n.type] || 'interacted with you'}</span>
          {n.snippet && <span className="notif-snippet ellipsis">{n.snippet}</span>}
        </span>
        <time className="muted" dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
        {!n.read && <span className="sr-only">Unread</span>}
      </Link>
    </li>
  )
}
