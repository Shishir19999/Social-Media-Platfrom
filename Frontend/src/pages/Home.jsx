import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/contexts'
import Composer from '../components/Composer'
import Feed from '../components/Feed'
import Icon from '../components/Icon'
import { ParallaxLayer, Reveal } from '../components/Motion'
import { EmptyState } from '../components/States'
import { Suggestions, TrendingList } from '../components/Sidebar'

const FEATURES = [
  ['image', 'Share photos and thoughts', 'Post up to six images at once, with a draft that saves itself while you write.'],
  ['users', 'Follow people you like', 'Your Following feed keeps close friends in view; Explore shows everyone.'],
  ['hash', 'Join the conversation', 'Clickable #hashtags and @mentions, threaded replies and trending topics.'],
]

function Landing() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <ParallaxLayer speed={0.16} className="px-orbs"><span className="orb orb-a" /><span className="orb orb-b" /></ParallaxLayer>
        <ParallaxLayer speed={-0.08} className="px-grid"><span className="grid-dots" /></ParallaxLayer>
        <div className="hero-in">
          <Reveal as="p" className="eyebrow">A small, friendly social network</Reveal>
          <Reveal as="h1" id="hero-title" delay={80}>Share moments. Follow people. Join the conversation.</Reveal>
          <Reveal as="p" className="hero-lead" delay={160}>Orbit brings photos, hashtags and threaded comments together in one calm, fast place.</Reveal>
          <Reveal className="hero-cta" delay={240}>
            <Link to="/register" className="btn btn-primary btn-lg-inline">Create an account</Link>
            <Link to="/explore" className="btn btn-secondary btn-lg-inline">Browse Explore</Link>
          </Reveal>
        </div>
      </section>

      <section className="section" aria-label="Features">
        <ul className="features">
          {FEATURES.map(([icon, title, text], i) => (
            <Reveal as="li" key={title} delay={i * 90} className="card feature">
              <span className="state-icon"><Icon name={icon} size={24} /></span>
              <h2>{title}</h2>
              <p className="muted">{text}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="section section-alt">
        <ParallaxLayer speed={0.1} className="px-orbs"><span className="orb orb-c" /></ParallaxLayer>
        <div className="container">
          <Reveal as="h2" className="section-heading">Fresh on Orbit</Reveal>
          <div className="layout-2">
            <Feed query={{ scope: 'explore', limit: 5 }} />
            <aside className="aside"><TrendingList /><Suggestions /></aside>
          </div>
        </div>
      </section>
    </>
  )
}

function Timeline() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('feed') === 'explore' ? 'explore' : 'following'
  const [fresh, setFresh] = useState(null)
  const setTab = (t) => setParams(t === 'following' ? {} : { feed: t }, { replace: true })

  return (
    <div className="container layout-2">
      <div className="col">
        <h1 className="page-title">Welcome back, {user.displayName || user.username}</h1>
        <Composer onPosted={(p) => { setFresh(p); setTab('following') }} />
        <div className="tabs" role="tablist" aria-label="Feed">
          <button role="tab" type="button" id="tab-following" aria-selected={tab === 'following'} aria-controls="feed-panel" className="tab-btn" onClick={() => setTab('following')}>Following</button>
          <button role="tab" type="button" id="tab-explore" aria-selected={tab === 'explore'} aria-controls="feed-panel" className="tab-btn" onClick={() => setTab('explore')}>Explore</button>
        </div>
        <div id="feed-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <Feed
            key={tab}
            query={{ scope: tab }}
            prepend={tab === 'following' ? fresh : null}
            empty={tab === 'following' ? (
              <EmptyState icon="users" title="Your Following feed is empty" action={<button type="button" className="btn btn-primary" onClick={() => setTab('explore')}>Discover people on Explore</button>}>
                Follow a few people and their posts will appear here.
              </EmptyState>
            ) : undefined}
          />
        </div>
      </div>
      <aside className="aside"><TrendingList /><Suggestions /></aside>
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  return user ? <Timeline /> : <Landing />
}
