import Feed from '../components/Feed'
import { ParallaxLayer, Reveal } from '../components/Motion'
import { Suggestions, TrendingList } from '../components/Sidebar'

export default function Explore() {
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
        <Feed query={{ scope: 'explore' }} />
        <aside className="aside"><TrendingList /><Suggestions /></aside>
      </div>
    </>
  )
}
