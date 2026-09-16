export function isWeakNlpResult(job = {}) {
  const warnings = job.warnings || job.analysis_warnings || [];
  return warnings.some((warning) =>
    /Full NLP unavailable|Full NLP failed|rules-only|exceeded budget/i.test(String(warning || ''))
  );
}

export class AnalysisJobError extends Error {
  constructor(message, {result, job_id, warnings} = {}) {
    super(message);
    this.name = 'AnalysisJobError';
    this.result = result || null;
    this.job_id = job_id;
    this.warnings = warnings || [];
  }
}

export async function waitForAnalysis(initial, poll, {
  interval = 1000,
  timeout = 600000,
  signal,
  onProgress,
  requireFullNlp = true,
} = {}) {
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
  onProgress?.(job);
  if (job.status === 'failed') {
    throw new AnalysisJobError(job.error || 'Analysis failed', {
      result: job.result,
      job_id: initial.job_id,
      warnings: job.warnings || [],
    });
  }
  if (['completed','partial'].includes(job.status)) {
   if (requireFullNlp && (job.status === 'partial' && isWeakNlpResult(job))) {
     throw new AnalysisJobError(
       (job.warnings || ['Full NLP did not complete']).join('. '),
       {result: job.result, job_id: initial.job_id, warnings: job.warnings || []},
     );
   }
   return {...job.result, analysis_status:job.status, analysis_warnings:job.warnings || [], job_id: initial.job_id};
  }
  await new Promise(resolve => setTimeout(resolve, interval));
 }
 throw new Error('URL analysis timed out while still queued. Job ID: ' + initial.job_id);
}
