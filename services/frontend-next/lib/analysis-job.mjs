export function isWeakNlpResult(job = {}) {
  const warnings = job.warnings || job.analysis_warnings || [];
  return warnings.some((warning) =>
    /Full NLP unavailable|Full NLP failed|rules-only|exceeded budget/i.test(String(warning || ''))
  );
}

const CACHED_SOURCE_RE = /retrieved from database|database cache|diambil dari database/i;

export function isCachedAnalyzeResult(result = {}) {
  if (result == null || result.cached === false) return false;
  if (result.cached === true) return true;
  const source = String(result.source || '').toLowerCase();
  if (source === 'database' || source.includes('database')) return true;
  const warnings = result.analysis_warnings || result.warnings || [];
  if (warnings.some((warning) => CACHED_SOURCE_RE.test(String(warning || '')))) return true;
  const sources = result.sources && typeof result.sources === 'object' ? Object.values(result.sources) : [];
  return sources.some((value) => CACHED_SOURCE_RE.test(String(value || '')));
}

function stampCached(result, job = null) {
  if (result == null || typeof result !== 'object') return result;
  const cached = job && job.cached != null
    ? Boolean(job.cached)
    : (result.cached != null ? Boolean(result.cached) : isCachedAnalyzeResult(result));
  if (result.cached === cached) return result;
  return { ...result, cached };
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
 if (!initial?.job_id) {
  if (initial && initial.cached == null && isCachedAnalyzeResult(initial)) {
    return { ...initial, cached: true };
  }
  return initial;
 }
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
   const merged = {...job.result, analysis_status:job.status, analysis_warnings:job.warnings || [], job_id: initial.job_id};
   return stampCached(merged, job);
  }
  await new Promise(resolve => setTimeout(resolve, interval));
 }
 throw new Error('URL analysis timed out while still queued. Job ID: ' + initial.job_id);
}
