/**
 * Who the current work is for: the logged-in user of a web request (header set by the middleware from the session),
 * or the user who queued a worker job (set around the job with runAs). AI calls are charged to them.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage<{ userId: number | null }>();

export const runAs = <T>(userId: number | null, fn: () => Promise<T>) => als.run({ userId }, fn);

export async function actorId(): Promise<number | null> {
  const s = als.getStore();
  if (s) return s.userId;
  try {
    // web requests only (the worker always runs inside runAs); kept out of the worker bundle
    const { headers } = await import("next/headers");
    const v = Number((await headers()).get("x-user-id"));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
