// =============================================================================
// v2 offering registry — handlers register themselves at import time, then
// the runtime calls dispatch() to route an incoming job to its handler.
//
// Other agents own the individual handler files under ./handlers/ — each
// imports `register` from this module to add itself to HANDLERS.
// =============================================================================

export type V2Handler = (request: Record<string, unknown>) => Promise<string>;

const HANDLERS = new Map<string, V2Handler>();

export function register(name: string, handler: V2Handler): void {
  if (HANDLERS.has(name)) {
    throw new Error(`v2 offering "${name}" registered twice`);
  }
  HANDLERS.set(name, handler);
}

export function getHandler(name: string): V2Handler | undefined {
  return HANDLERS.get(name);
}

export async function dispatch(
  name: string,
  request: Record<string, unknown>
): Promise<string> {
  const h = HANDLERS.get(name);
  if (!h) {
    throw new Error(`Unknown v2 offering: ${name}`);
  }
  return h(request);
}

export function listRegistered(): string[] {
  return [...HANDLERS.keys()].sort();
}
