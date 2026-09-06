import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForAnalysis} from '../lib/analysis-job.mjs';
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
test('partial result preserves warnings', async () => {
 const r = await waitForAnalysis({job_id:'abc'},async()=>({status:'partial',result:{content:'article'},warnings:['NLP unavailable']}),{interval:0});
 assert.equal(r.analysis_status,'partial');
 assert.deepEqual(r.analysis_warnings,['NLP unavailable']);
});
test('polling has a finite deadline', async () => {
 await assert.rejects(waitForAnalysis({job_id:'abc'},async()=>({status:'processing'}),{interval:0,timeout:0}),/abc/);
});
