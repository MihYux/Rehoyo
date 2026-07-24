export function parseResearchAction(value: unknown): any
export function executeResearchAction(action: any, tools: Record<string, (...args: any[]) => Promise<any>>): Promise<any>
