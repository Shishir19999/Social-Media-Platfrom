// Minimal inline icon set (24x24, stroke based) so no icon font or CDN is needed.
const PATHS = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  bell: <><path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  bookmark: <path d="M6 4h12v17l-6-4.5L6 21z" />,
  heart: <path d="M12 20s-7.5-4.6-9-9.2A5 5 0 0 1 12 7a5 5 0 0 1 9 3.8C19.5 15.400 12 20 12 20z" />,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  share: <><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.500 4.500 4.500L19 7" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.500v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.500v.01" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500 19 19M5 19l1.500-1.500M17.500 6.500 19 5" /></>,
  moon: <path d="M20 14.500A8.500 8.500 0 0 1 9.500 4 8.500 8.500 0 1 0 20 14.500z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.500-6 8-6s8 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.500" /><path d="M2.500 20c0-3.500 3-5.500 6.500-5.500s6.500 2 6.500 5.500" /><path d="M16 4.500a3.500 3.500 0 0 1 0 7M18.500 14.800c2 .7 3 2.300 3 5.200" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.500 6.500 4 4" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.600 6.100A9.500 9.500 0 0 1 12 6c5 0 8.500 4 9.500 6a14 14 0 0 1-3 3.700M6.600 7.300A14 14 0 0 0 2.500 12c1 2 4.500 6 9.500 6 1.400 0 2.600-.3 3.700-.8" /><path d="M9.900 10A3 3 0 0 0 14 14.100" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></>,
  hash: <path d="M5 9h15M4 15h15M10 4 8 20M16 4l-2 16" />,
  logout: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.500" /></>,
  eye: <><path d="M2.500 12C4 9 7.500 6 12 6s8 3 9.500 6c-1.500 3-5 6-9.500 6s-8-3-9.500-6z" /><circle cx="12" cy="12" r="3" /></>,
  reply: <><path d="M10 8 4 13l6 5" /><path d="M4 13h9a7 7 0 0 1 7 7" /></>,
  sparkles: <><path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z" /><path d="M19 16v4M17 18h4" /></>,
  repeat: <><path d="M17 3l4 4-4 4" /><path d="M3 11V9a2 2 0 0 1 2-2h16" /><path d="M7 21l-4-4 4-4" /><path d="M21 13v2a2 2 0 0 1-2 2H3" /></>,
  quote: <path d="M7 7h4v4c0 3-1 5-4 6M15 7h4v4c0 3-1 5-4 6" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  send: <><path d="M21 3 10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900 7 7M17 17l2.100 2.100M4.900 19.100 7 17M17 7l2.100-2.100" /></>,
  pin: <><path d="M9 3h6l-1 6 3 3H7l3-3z" /><path d="M12 12v9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  poll: <path d="M5 20V10M12 20V4M19 20v-7" />,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14c1 1.500 2.300 2 4 2s3-.5 4-2" /><path d="M9 9.500v.01M15 9.500v.01" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="m5.600 5.600 12.800 12.800" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 4 6M21 9l-4 6" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.700L3 8" /><path d="M3 3v5h5" /><path d="M12 8v4l3 2" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>,
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>,
  userPlus: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M19 8v6M16 11h6" /></>,
}

const FILLED = new Set(['heart-fill', 'bookmark-fill'])

export default function Icon({ name, size = 20, className = '', title }) {
  const fill = FILLED.has(name)
  const key = fill ? name.replace('-fill', '') : name
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
    >
      {PATHS[key] || null}
    </svg>
  )
}
