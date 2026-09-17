export function isWeakNlpResult(job?: any): boolean;
export function isCachedAnalyzeResult(result?: any): boolean;
export class AnalysisJobError extends Error {
  result: any;
  job_id?: string;
  warnings: string[];
  constructor(message: string, options?: { result?: any; job_id?: string; warnings?: string[] });
}
export function waitForAnalysis(initial: any, poll: (id: string) => Promise<any>, options?: {interval?:number;timeout?:number;signal?:AbortSignal}): Promise<any>;
