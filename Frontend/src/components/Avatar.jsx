import { hashString, initials } from '../lib/format'

const HUES = [236, 262, 292, 330, 12, 32, 160, 190, 210]

/** Profile picture, or a coloured initials badge when the user has none. */
export default function Avatar({ user, size = 40, className = '' }) {
  const name = user?.displayName || user?.username || '?'
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  if (user?.avatar) {
    return <img className={`avatar ${className}`} src={user.avatar} alt="" style={style} loading="lazy" width={size} height={size} />
  }
  const hue = HUES[hashString(user?.username || name) % HUES.length]
  return (
    <span
      className={`avatar avatar-fallback ${className}`}
      style={{ ...style, background: `linear-gradient(135deg, hsl(${hue} 70% 38%), hsl(${(hue + 40) % 360} 70% 30%))` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
