import { describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
// Release tooling is JavaScript so it runs before dependencies are installed.
// @ts-expect-error This repository-local release script has no public declarations.
import { readFirstPublicationDescriptor, runFirstPublication, verifyFirstPublication } from '../scripts/verify-first-publication.mjs';

const sha = 'a'.repeat(40);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const organization = new URL(manifest.repository.url.replace(/^git\+/u, '')).pathname.split('/')[1];
const descriptor = { repository: `${organization}/learning-runtime`, packageName: '@plasius/learning-runtime', version: '0.1.2' };
const valid = { ...descriptor, descriptor, optIn: 'true', credentialPresent: true,
  ref: 'refs/heads/main', workflowRef: `${descriptor.repository}/.github/workflows/cd.yml@refs/heads/main`,
  eventName: 'workflow_dispatch', expectedCommitSha: sha, checkedOutSha: sha, workflowSha: sha };
const environment = { GITHUB_REPOSITORY: valid.repository, PACKAGE_NAME: valid.packageName, PACKAGE_VERSION: valid.version,
  FIRST_PUBLICATION: 'true', NPM_TOKEN: 'synthetic-test-credential', GITHUB_REF: valid.ref,
  GITHUB_WORKFLOW_REF: valid.workflowRef, GITHUB_EVENT_NAME: valid.eventName, EXPECTED_SHA: sha, ACTUAL_SHA: sha, GITHUB_SHA: sha };

describe('first-package publication guard', () => {
  it('refuses retired enrollment before verification despite an explicit valid opt-in', async () => {
    const file = fileURLToPath(new URL('../.github/npm-first-publication.json', import.meta.url));
    expect(existsSync(file)).toBe(false);
    const verify = vi.fn();
    const report = vi.fn();
    expect(await runFirstPublication(environment, {
      readDescriptor: () => readFirstPublicationDescriptor(file), verify, report,
    })).toBe(1);
    expect(verify).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith('First-publication verification failed; check enrollment, exact main and registry absence.\n');
  });
  it('permits only the named package when the public registry confirms absence', async () => {
    const registry = vi.fn().mockResolvedValue({ status: 404 });
    await verifyFirstPublication(valid, registry);
    expect(registry).toHaveBeenCalledWith('https://registry.npmjs.org/@plasius%2flearning-runtime', {
      signal: expect.any(AbortSignal), redirect: 'error', headers: { accept: 'application/json' },
    });
  });
  it.each([200, 301, 401, 403, 429, 500])('rejects registry status %i without treating errors as absence', async status => {
    await expect(verifyFirstPublication(valid,
      vi.fn().mockResolvedValue({ status }))).rejects.toThrow('confirmed absent');
  });
  it('rejects another package, a missing credential and a failed registry request', async () => {
    const registry = vi.fn();
    await expect(verifyFirstPublication({ ...valid, packageName: '@plasius/other' }, registry)).rejects.toThrow('admission');
    await expect(verifyFirstPublication({ ...valid, credentialPresent: false }, registry)).rejects.toThrow('admission');
    expect(registry).not.toHaveBeenCalled();
    await expect(verifyFirstPublication(valid,
      vi.fn().mockRejectedValue(new Error('network failure')))).rejects.toThrow();
  });
  it('returns a failing exit code with a bounded message and does not expose dependency errors', async () => {
    const report = vi.fn();
    const verify = vi.fn().mockRejectedValue(new Error('private registry detail'));
    expect(await runFirstPublication(environment, { verify, report, readDescriptor: () => descriptor })).toBe(1);
    expect(report).toHaveBeenCalledWith('First-publication verification failed; check enrollment, exact main and registry absence.\n');
    report.mockClear();
    expect(await runFirstPublication(environment, { verify: vi.fn().mockResolvedValue(undefined), report, readDescriptor: () => descriptor })).toBe(0);
    expect(report).not.toHaveBeenCalled();
  });
  it('runs the CLI boundary with a failing exit code when the managed secret is absent', async () => {
    const argv = process.argv;
    const exitCode = process.exitCode;
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.stubEnv('NPM_TOKEN', '');
    vi.stubEnv('PACKAGE_NAME', '@plasius/learning-runtime');
    process.argv = [process.execPath, fileURLToPath(new URL('../scripts/verify-first-publication.mjs', import.meta.url))];
    try {
      vi.resetModules();
      // @ts-expect-error Exercise the dependency-free JavaScript CLI entry point.
      await import('../scripts/verify-first-publication.mjs');
      expect(process.exitCode).toBe(1);
      expect(stderr).toHaveBeenCalledWith('First-publication verification failed; check enrollment, exact main and registry absence.\n');
    } finally {
      process.argv = argv;
      process.exitCode = exitCode;
      stderr.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
