import assert from 'node:assert/strict'
import test from 'node:test'
import { sourceCatalogType, sourceCredibilityType, sourceOrigin, sourceValidityStatus } from '../lib/source-catalog.mjs'

test('sourceCatalogType prefers Alma category over crawler engine web', () => {
  assert.equal(
    sourceCatalogType({ source_type: 'web', config: { catalog_type: 'Local News' } }),
    'Local News',
  )
  assert.equal(sourceCatalogType({ source_type: 'rss', config: {} }), 'rss')
})

test('source origin and validity stay independent of Official vs Main Source', () => {
  const source = {
    source_type: 'web',
    config: {
      catalog_type: 'Google',
      validity_status: 'Unofficial',
      source_origin: 'Other Source',
      from_engine: 'Yes',
    },
  }
  assert.equal(sourceCatalogType(source), 'Google')
  assert.equal(sourceValidityStatus(source), 'Unofficial')
  assert.equal(sourceOrigin(source), 'Other Source')
})

test('sourceCredibilityType maps Alma categories onto existing score rows', () => {
  assert.equal(sourceCredibilityType('Official Government Sites', 'web'), 'government')
  assert.equal(sourceCredibilityType('Local News', 'web'), 'news')
  assert.equal(sourceCredibilityType('Google', 'web'), 'web')
  assert.equal(sourceCredibilityType('Facebook', 'web'), 'social_media')
})
