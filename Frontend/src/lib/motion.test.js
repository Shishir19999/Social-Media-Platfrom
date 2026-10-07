import { describe, expect, it } from 'vitest'
import { parallaxAllowed, parallaxOffset } from './motion'

describe('parallaxAllowed', () => {
  it('is on for a normal desktop', () => {
    expect(parallaxAllowed({ width: 1280, cores: 8, memory: 8 })).toBe(true)
  })
  it('is off for reduced motion, small screens, data saver and low power', () => {
    expect(parallaxAllowed({ width: 1280, reducedMotion: true })).toBe(false)
    expect(parallaxAllowed({ width: 600 })).toBe(false)
    expect(parallaxAllowed({ width: 1280, saveData: true })).toBe(false)
    expect(parallaxAllowed({ width: 1280, memory: 2 })).toBe(false)
    expect(parallaxAllowed({ width: 1280, cores: 2 })).toBe(false)
  })
})

describe('parallaxOffset', () => {
  it('is zero when centred and moves against the scroll direction', () => {
    expect(parallaxOffset({ top: 300, height: 200 }, 800, 0.2)).toBeCloseTo(0)
    expect(parallaxOffset({ top: 0, height: 200 }, 800, 0.2)).toBeGreaterThan(0)
    expect(parallaxOffset({ top: 600, height: 200 }, 800, 0.2)).toBeLessThan(0)
  })
  it('is clamped', () => {
    expect(parallaxOffset({ top: -5000, height: 200 }, 800, 0.5, 60)).toBe(60)
  })
})
