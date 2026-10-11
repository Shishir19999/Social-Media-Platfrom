import { Link } from 'react-router-dom'
import { timeAgo } from '../lib/format'
import Avatar from './Avatar'
import Icon from './Icon'

const TEXT = {
  like: 'liked your post',
  reaction: 'reacted to your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  mention: 'mentioned you',
  follow: 'started following you',
  request: 'asked to follow you',
  accepted: 'accepted your follow request',
  repost: 'reposted your post',
  quote: 'quoted your post',
  moderation: 'A moderator reviewed your post',
}
const ICON = {
  like: 'heart', reaction: 'smile', comment: 'message', reply: 'reply', mention: 'hash', follow: 'user', request: 'userPlus',
  accepted: 'check', repost: 'repeat', quote: 'quote', moderation: 'shield',
}

export default function NotificationItem({ n, onNavigate }) {
  let to = n.postId ? `/post/${n.postId}` : `/u/${n.actor.username}`
  if (n.type === 'request') to = '/settings#requests'
  return (
    <li>
      <Link to={to} className={`notif ${n.read ? '' : 'notif-unread'}`} onClick={onNavigate}>
        <span className={`notif-icon notif-${n.type}`}><Icon name={ICON[n.type] || 'bell'} size={16} /></span>
        <Avatar user={n.actor} size={36} />
        <span className="grow min0">
          <span>{n.type === 'moderation' ? TEXT.moderation : <><strong>{n.actor.displayName}</strong> {TEXT[n.type] || 'interacted with you'}</>}</span>
          {n.snippet && <span className="notif-snippet ellipsis">{n.snippet}</span>}
        </span>
        <time className="muted" dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
        {!n.read && <span className="sr-only">Unread</span>}
      </Link>
    </li>
  )
}
