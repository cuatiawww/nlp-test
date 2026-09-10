export async function waitForAnalysis(initial, poll, {interval = 2000, timeout = 600000, signal} = {}) {
 if (!initial?.job_id) return initial;
 const deadline = Date.now() + timeout;
 while (Date.now() < deadline) {
  if (signal?.aborted) throw new Error('Analysis polling cancelled');
  let job;
  try {
   job = await poll(initial.job_id);
  } catch (error) {
   // A single status request can time out while the worker is extracting a
   // large PDF or while the backend is briefly waiting for the DB. Keep the
   // job alive and retry until the overall polling deadline is reached.
   if (Date.now() >= deadline) throw error;
   await new Promise(resolve => setTimeout(resolve, interval));
   continue;
  }
  if (job.status === 'failed') throw new Error(job.error || 'Analysis failed');
  if (['completed','partial'].includes(job.status)) {
   return {...job.result, analysis_status:job.status, analysis_warnings:job.warnings || [], job_id: initial.job_id};
  }
  await new Promise(resolve => setTimeout(resolve, interval));
 }
 throw new Error('Analysis is still queued. Job ID: ' + initial.job_id);
}
