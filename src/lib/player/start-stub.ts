export function createServerFn(_opts?: { method?: string }) {
  const api = {
    validator(_schema?: unknown) {
      return api;
    },
    inputValidator(_schema?: unknown) {
      return api;
    },
    middleware(_mw?: unknown) {
      return api;
    },
    handler(fn: (opts: { data: unknown }) => unknown | Promise<unknown>) {
      const run = async (opts?: { data?: unknown }) => fn({ data: opts?.data });
      return run;
    },
  };
  return api;
}