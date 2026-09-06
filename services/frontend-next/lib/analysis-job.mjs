export async function waitForAnalysis(initial, poll, {interval = 1500, timeout = 300000, signal} = {}) {
 if (!initial?.job_id) return initial;
 const deadline = Date.now() + timeout;
 while (Date.now() < deadline) {
  if (signal?.aborted) throw new Error('Analysis polling cancelled');
  const job = await poll(initial.job_id);
  if (job.status === 'failed') throw new Error(job.error || 'Analysis failed');
  if (['completed','partial'].includes(job.status)) {
   return {...job.result, analysis_status:job.status, analysis_warnings:job.warnings || [], job_id: initial.job_id};
  }
  await new Promise(resolve => setTimeout(resolve, interval));
 }
 throw new Error('Analysis is still queued. Job ID: ' + initial.job_id);
}
