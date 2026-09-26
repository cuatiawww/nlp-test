import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseFacts,
  collapseAnalyzeResult,
  formatLabelCounts,
  joinUniqueLabels,
  displayCountry,
  displayRegion,
  flagCountryName,
  isMultiCountryValue,
} from '../lib/multiFactDisplay.mjs';

test('multi-disease names join with semicolon not comma', () => {
  const collapsed = collapseFacts([
    {disease: 'Influenza', location_name: 'Bangkok', case_count: 120, death_count: 0},
    {disease: 'Respiratory syncytial virus infection', location_name: 'Bangkok', case_count: 45, death_count: 0},
  ]);
  assert.equal(collapsed.diseaseDisplay, 'Influenza; RSV');
  assert.equal(collapsed.locationDisplay, 'Bangkok');
  assert.equal(collapsed.casesDisplay, 'Influenza(120); RSV(45)');
  assert.equal(collapsed.dimension, 'disease');
  assert.equal(collapsed.diseaseDisplay.includes(','), false);
});

test('multi-location cases use Location(count) matching the location column', () => {
  const collapsed = collapseFacts([
    {disease: 'Influenza', location_name: 'Indonesia', case_count: 8278, death_count: 12},
    {disease: 'Influenza', location_name: 'Philippines', case_count: 3734, death_count: 3},
  ]);
  assert.equal(collapsed.locationDisplay, 'Indonesia; Philippines');
  assert.equal(collapsed.casesDisplay, 'Indonesia(8278); Philippines(3734)');
  assert.equal(collapsed.deathsDisplay, 'Indonesia(12); Philippines(3)');
  assert.equal(collapsed.dimension, 'location');
});

test('when both disease and location vary, prefer Location(count)', () => {
  const collapsed = collapseFacts([
    {disease: 'Influenza', location_name: 'Indonesia', case_count: 8278, death_count: 12},
    {disease: 'RSV', location_name: 'Philippines', case_count: 3734, death_count: 3},
  ]);
  assert.equal(collapsed.diseaseDisplay, 'Influenza; RSV');
  assert.equal(collapsed.casesDisplay, 'Indonesia(8278); Philippines(3734)');
  assert.doesNotMatch(collapsed.casesDisplay, /Influenza\(8278\).*Philippines/);
});

test('empty deaths are omitted', () => {
  assert.equal(formatLabelCounts([['Indonesia', 0]], true), '');
  assert.equal(joinUniqueLabels(['Cancer, Stroke, Heart Attack']), 'Cancer, Stroke, Heart Attack');
});

test('analyze summary prefers API display fields then sub_events', () => {
  const fromApi = collapseAnalyzeResult({
    disease_display: 'Influenza; RSV',
    location_display: 'Jakarta; Manila',
    cases_display: 'Jakarta(10); Manila(4)',
  });
  assert.equal(fromApi.diseaseDisplay, 'Influenza; RSV');
  const fromEvents = collapseAnalyzeResult({
    disease_classification: 'Influenza',
    sub_events: [
      {disease: 'Influenza', location_name: 'Jakarta', case_count: 10, death_count: 1},
      {disease: 'RSV', location_name: 'Manila', case_count: 4, death_count: 0},
    ],
  });
  assert.equal(fromEvents.diseaseDisplay, 'Influenza; RSV');
  assert.equal(fromEvents.casesDisplay, 'Jakarta(10); Manila(4)');
});

test('multi-country hides MULTI_COUNTRY and keeps joined country names', () => {
  assert.equal(displayCountry('MULTI_COUNTRY', ['Indonesia', 'Vietnam', 'MULTI_COUNTRY']), 'Indonesia; Vietnam');
  assert.equal(displayCountry('Indonesia; Vietnam'), 'Indonesia; Vietnam');
  assert.equal(displayCountry('Indonesia'), 'Indonesia');
  assert.equal(isMultiCountryValue('Indonesia; Vietnam'), true);
  assert.equal(flagCountryName('Indonesia; Vietnam'), '');
  assert.equal(flagCountryName('Indonesia'), 'Indonesia');
});

test('region stays separate from country and uses master scope', () => {
  assert.equal(displayRegion('ASEAN', 'Indonesia'), 'ASEAN');
  assert.equal(displayRegion('Global', 'Indonesia; Vietnam'), 'Global');
  assert.equal(displayRegion(null, 'Indonesia; Vietnam'), 'Global');
  assert.equal(displayRegion('MULTI_COUNTRY', 'Indonesia; Vietnam'), 'Global');
  assert.equal(displayRegion(null, 'Indonesia'), 'ASEAN');
  assert.equal(displayRegion(null, 'United Kingdom'), 'Outside ASEAN');
});
