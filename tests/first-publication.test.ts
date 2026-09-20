import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
// Release tooling is JavaScript so it runs before dependencies are installed.
// @ts-expect-error This repository-local release script has no public declarations.
import { runFirstPublication, verifyFirstPublication } from '../scripts/verify-first-publication.mjs';

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
  it('returns a failing exit code with a bounded message and does not expose dependency errors', async () => {
    const report = vi.fn();
    const verify = vi.fn().mockRejectedValue(new Error('private registry detail'));
    expect(await runFirstPublication({ packageName: '@plasius/learning-runtime', tokenPresent: true }, verify, report)).toBe(1);
    expect(report).toHaveBeenCalledWith('First-publication verification failed. Check package existence and the production bootstrap credential.\n');
    report.mockClear();
    expect(await runFirstPublication({}, vi.fn().mockResolvedValue(undefined), report)).toBe(0);
    expect(report).not.toHaveBeenCalled();
  });
  it('runs the CLI boundary with a failing exit code when the managed secret is absent', async () => {
    const argv = process.argv;
    const exitCode = process.exitCode;
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.stubEnv('NODE_AUTH_TOKEN', '');
    vi.stubEnv('PACKAGE_NAME', '@plasius/learning-runtime');
    process.argv = [process.execPath, fileURLToPath(new URL('../scripts/verify-first-publication.mjs', import.meta.url))];
    try {
      vi.resetModules();
      // @ts-expect-error Exercise the dependency-free JavaScript CLI entry point.
      await import('../scripts/verify-first-publication.mjs');
      expect(process.exitCode).toBe(1);
      expect(stderr).toHaveBeenCalledWith('First-publication verification failed. Check package existence and the production bootstrap credential.\n');
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
      stderr.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
