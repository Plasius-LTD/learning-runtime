import { describe, expect, it, vi } from 'vitest';
// Release tooling is JavaScript so it runs before dependencies are installed.
// @ts-expect-error This repository-local release script has no public declarations.
import { verifyFirstPublication } from '../scripts/verify-first-publication.mjs';

describe('first-package publication guard', () => {
  it('permits only the named package when the public registry confirms absence', async () => {
    const registry = vi.fn().mockResolvedValue({ status: 404 });
    await verifyFirstPublication({ packageName: '@plasius/learning-runtime', tokenPresent: true }, registry);
    expect(registry).toHaveBeenCalledWith('https://registry.npmjs.org/@plasius%2flearning-runtime', {
      signal: expect.any(AbortSignal), redirect: 'error',
    });
  });
  it.each([200, 301, 401, 403, 429, 500])('rejects registry status %i without treating errors as absence', async status => {
    await expect(verifyFirstPublication({ packageName: '@plasius/learning-runtime', tokenPresent: true },
      vi.fn().mockResolvedValue({ status }))).rejects.toThrow('confirmed absent');
  });
  it('rejects another package, a missing credential and a failed registry request', async () => {
    const registry = vi.fn();
    await expect(verifyFirstPublication({ packageName: '@plasius/other', tokenPresent: true }, registry)).rejects.toThrow('expected package');
    await expect(verifyFirstPublication({ packageName: '@plasius/learning-runtime', tokenPresent: false }, registry)).rejects.toThrow('expected package');
    expect(registry).not.toHaveBeenCalled();
    await expect(verifyFirstPublication({ packageName: '@plasius/learning-runtime', tokenPresent: true },
      vi.fn().mockRejectedValue(new Error('network failure')))).rejects.toThrow();
  });
});
