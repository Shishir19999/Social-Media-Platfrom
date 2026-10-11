import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/contexts'
import { useAsync } from '../hooks/useAsync'
import Feed from '../components/Feed'
import { ParallaxLayer, Reveal } from '../components/Motion'
import { PersonRow, Suggestions, TrendingList } from '../components/Sidebar'
import { EmptyState, ErrorState, ListSkeleton } from '../components/States'
import { plural } from '../lib/format'

const TABS = [['posts', 'Posts'], ['people', 'People'], ['trending', 'Trending']]

function People() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(() => api.suggestions({ limit: 24 }), [user?.id])
  return (
    <section className="card side-card" aria-label="People to follow">
      {loading && <ListSkeleton count={5} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon="users" title="You follow everyone here">Check back when more people join.</EmptyState>}
      {data && <ul className="stack-sm">{data.map((p) => <PersonRow key={p.id} person={p} />)}</ul>}
    </section>
  )
}

function Trending() {
  const { data, loading, error, reload } = useAsync(() => api.trending(), [])
  return (
    <section className="card side-card" aria-label="Trending hashtags">
      {loading && <ListSkeleton count={5} />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState icon="hash" title="Nothing is trending yet">Hashtags trend once people start using them.</EmptyState>}
      {data && (
        <ol className="trend-list">
          {data.map((t, i) => (
            <li key={t.tag}>
              <Link to={`/tag/${encodeURIComponent(t.tag)}`} className="trend">
                <span className="muted trend-rank">{i + 1}</span>
                <span className="trend-tag">#{t.tag}</span>
                <span className="muted">{plural(t.count, 'post')}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'posts'
  return (
    <>
      <section className="hero hero-sm" aria-labelledby="explore-title">
        <ParallaxLayer speed={0.14} className="px-orbs"><span className="orb orb-a" /><span className="orb orb-b" /></ParallaxLayer>
        <div className="hero-in">
          <Reveal as="h1" id="explore-title">Explore</Reveal>
          <Reveal as="p" className="hero-lead" delay={80}>Everything people are sharing right now.</Reveal>
          <Reveal delay={160}><TrendingList compact /></Reveal>
        </div>
      </section>
      <div className="container layout-2">
        <div className="col">
          <div className="tabs tabs-top" role="tablist" aria-label="Explore">
            {TABS.map(([key, label]) => (
              <button key={key} role="tab" type="button" id={`ex-tab-${key}`} aria-selected={tab === key} aria-controls="ex-panel" className="tab-btn" onClick={() => setParams(key === 'posts' ? {} : { tab: key }, { replace: true })}>{label}</button>
            ))}
          </div>
          <div id="ex-panel" role="tabpanel" aria-labelledby={`ex-tab-${tab}`}>
            {tab === 'posts' && <Feed query={{ scope: 'explore' }} />}
            {tab === 'people' && <People />}
            {tab === 'trending' && <Trending />}
          </div>
        </div>
        <aside className="aside"><TrendingList /><Suggestions /></aside>
      </div>
    </>
  )
}
