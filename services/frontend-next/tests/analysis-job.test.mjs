import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForAnalysis, AnalysisJobError, isWeakNlpResult, isCachedAnalyzeResult} from '../lib/analysis-job.mjs';
test('legacy response is returned unchanged', async () => {
 const legacy = {case_count: 10};
 assert.equal(await waitForAnalysis(legacy, () => { throw Error('unexpected poll'); }), legacy);
});
test('queued response polls until completed', async () => {
 const replies = [{status: 'processing'}, {status:'completed',result:{case_count:10}}];
 const result = await waitForAnalysis({job_id:'abc',status:'queued'}, async () => replies.shift(), {interval:0});
 assert.equal(result.case_count,10);
});
test('failed job propagates actionable message', async () => {
 await assert.rejects(waitForAnalysis({job_id:'abc'},async()=>({status:'failed',error:'Fetch failed'}),{interval:0}),/Fetch failed/);
});
test('failed job keeps extracted article text on the error', async () => {
 try {
  await waitForAnalysis({job_id:'abc'},async()=>({status:'failed',error:'Full NLP failed',result:{content:'article'}}),{interval:0});
  assert.fail('expected throw');
 } catch (error) {
  assert.equal(error instanceof AnalysisJobError, true);
  assert.equal(error.result.content, 'article');
 }
});
test('partial result preserves warnings when rules-only is allowed', async () => {
 const r = await waitForAnalysis({job_id:'abc'},async()=>({status:'partial',result:{content:'article'},warnings:['NLP unavailable']}),{interval:0, requireFullNlp:false});
 assert.equal(r.analysis_status,'partial');
 assert.deepEqual(r.analysis_warnings,['NLP unavailable']);
});
test('weak rules-only partial is not treated as Full NLP success', async () => {
 await assert.rejects(
  waitForAnalysis(
   {job_id:'abc'},
   async()=>({status:'partial',result:{content:'article'},warnings:['Full NLP unavailable (NLP HTTP 408: exceeded budget (90s)); attempted bounded rules-only analysis']}),
   {interval:0, requireFullNlp:true},
  ),
  /Full NLP unavailable/,
 );
 assert.equal(isWeakNlpResult({warnings:['attempted bounded rules-only analysis']}), true);
});
test('progress callback receives job stage while polling', async () => {
 const stages = [];
 const replies = [{status:'processing',stage:'nlp'}, {status:'completed',result:{case_count:12},stage:'finished'}];
 await waitForAnalysis({job_id:'abc',status:'queued'}, async () => replies.shift(), {
  interval:0,
  onProgress: (job) => stages.push(job.stage),
 });
 assert.deepEqual(stages, ['nlp', 'finished']);
});
test('transient polling timeout is retried', async () => {
 let attempts = 0;
 const result = await waitForAnalysis({job_id:'abc'}, async () => {
  attempts += 1;
  if (attempts === 1) throw new Error('signal timed out');
  return {status:'completed',result:{case_count:1362}};
 }, {interval:0, timeout:1000});
 assert.equal(result.case_count, 1362);
 assert.equal(attempts, 2);
});
test('polling has a finite deadline', async () => {
 await assert.rejects(waitForAnalysis({job_id:'abc'},async()=>({status:'processing'}),{interval:0,timeout:0}),/timed out while still queued.*abc/);
});
test('isCachedAnalyzeResult detects cached flag and database source messages', () => {
 assert.equal(isCachedAnalyzeResult({cached:true}), true);
 assert.equal(isCachedAnalyzeResult({cached:false,sources:{title:'Data retrieved from database'}}), false);
 assert.equal(isCachedAnalyzeResult({source:'database'}), true);
 assert.equal(isCachedAnalyzeResult({source:'database-content-identity'}), true);
 assert.equal(isCachedAnalyzeResult({analysis_warnings:['Data retrieved from database']}), true);
 assert.equal(isCachedAnalyzeResult({sources:{title:'Data retrieved from database (previous analysis result)'}}), true);
 assert.equal(isCachedAnalyzeResult({sources:{title:'Data diambil dari database'}}), true);
 assert.equal(isCachedAnalyzeResult({sources:{title:'Classified by XLM-RoBERTa'}}), false);
 assert.equal(isCachedAnalyzeResult({}), false);
});
test('completed cache hit stamps cached true from job and result', async () => {
 const result = await waitForAnalysis(
  {job_id:'abc',status:'queued'},
  async () => ({
   status:'completed',
   cached:true,
   result:{case_count:10,sources:{title:'Data retrieved from database'}},
   warnings:['Equivalent content retrieved from database cache'],
  }),
  {interval:0},
 );
 assert.equal(result.cached, true);
 assert.equal(result.case_count, 10);
});
test('completed full NLP stamps cached false', async () => {
 const result = await waitForAnalysis(
  {job_id:'abc',status:'queued'},
  async () => ({status:'completed',result:{case_count:10,sources:{title:'Extracted by Scrapling'}}}),
  {interval:0},
 );
 assert.equal(result.cached, false);
});
test('synchronous database payload is stamped cached without polling', async () => {
 const payload = {case_count:3,sources:{title:'Data retrieved from database (previous analysis result)'}};
 const result = await waitForAnalysis(payload, () => { throw Error('unexpected poll'); });
 assert.equal(result.cached, true);
 assert.equal(result.case_count, 3);
});
test('explicit cached false wins over database-looking source text', async () => {
 const result = await waitForAnalysis(
  {job_id:'abc'},
  async () => ({status:'completed',cached:false,result:{sources:{title:'Data retrieved from database'}}}),
  {interval:0},
 );
 assert.equal(result.cached, false);
});
