import { describe, expect, it } from 'vitest'
import { isAnalyticsEnabled } from '../../app/lib/analytics-config'

describe('analytics runtime enable gate', () => {
  it.each([true, 'true'])('accepts only explicit true (%j) with a valid ID', (flag) => {
    expect(isAnalyticsEnabled(flag, 'G-2GD5P03B7S')).toBe(true)
  })

  it.each([false, 'false', '', 'TRUE', 1, '1', null, undefined])('rejects %j even with a valid ID', (flag) => {
    expect(isAnalyticsEnabled(flag, 'G-2GD5P03B7S')).toBe(false)
  })

  it.each(['', 'G-', 'G-invalid', 'G-ABC?token=private', 'G-ABC\n', null, 123])('rejects invalid measurement ID %j', (id) => {
    expect(isAnalyticsEnabled(true, id)).toBe(false)
  })
})

import { analyticsCommonContext, analyticsDeploymentEnvironment, analyticsAppVersion } from '../../app/lib/analytics-config'
describe('deployment context', () => {
  it('distinguishes preview production builds and validates explicit overrides', () => {
    expect(analyticsDeploymentEnvironment(undefined, 'preview')).toBe('staging')
    expect(analyticsDeploymentEnvironment(undefined, 'production')).toBe('production')
    expect(analyticsDeploymentEnvironment(undefined, 'development')).toBe('development')
    expect(analyticsDeploymentEnvironment('invalid', undefined)).toBe('development')
    expect(analyticsDeploymentEnvironment('staging', 'production')).toBe('staging')
  })
  it('only allows deployment SHA or local version and fixed taxonomy', () => {
    expect(analyticsAppVersion(undefined, 'abcdef1234567890')).toBe('abcdef1')
    expect(analyticsAppVersion('private string', undefined)).toBe('local')
    expect(analyticsCommonContext('staging', 'abcdef1')).toEqual({ environment: 'staging', app_version: 'abcdef1', taxonomy_version: 'zeno_v2' })
  })
})
