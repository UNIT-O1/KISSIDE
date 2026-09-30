import { vi } from 'vitest';

/**
 * One scripted reply: a JSON body with optional status, raw text, a thrown error,
 * 'hang' (never answers, rejects when aborted), or a function for full control.
 */
export type Reply =
  | { status?: number; body?: unknown; text?: string }
  | Error
  | 'hang'
  | ((url: string) => Promise<Response>);

/** Stubs global fetch. Replies are used in order; the last one repeats. */
export function mockFetch(...replies: Reply[]) {
  const queue = [...replies];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (reply === 'hang') {
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        ),
      );
    }
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply(url);
    return new Response(reply.text ?? JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** URLs fetch was called with, in order. */
export function calledUrls(fn: ReturnType<typeof mockFetch>): URL[] {
  return fn.mock.calls.map(([input]) => new URL(String(input)));
}

/** A reply that resolves only when the returned `resolve` is called. */
export function deferred(body: unknown) {
  let resolve!: () => void;
  const reply = () =>
    new Promise<Response>((r) => {
      resolve = () => r(new Response(JSON.stringify(body)));
    });
  return { reply, resolve: () => resolve() };
}
