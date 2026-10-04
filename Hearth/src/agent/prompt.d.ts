import type {PlanRequest} from './types';

export declare const SYSTEM_ZH: string;
export declare const SYSTEM_EN: string;
export declare function buildMessages(
  req: PlanRequest,
): Array<{role: 'system' | 'user'; content: string}>;
