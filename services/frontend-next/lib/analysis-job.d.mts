export function waitForAnalysis(initial: any, poll: (id: string) => Promise<any>, options?: {interval?:number;timeout?:number;signal?:AbortSignal}): Promise<any>;
