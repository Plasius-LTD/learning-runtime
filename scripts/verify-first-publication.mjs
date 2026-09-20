import { pathToFileURL } from 'node:url';

/** Fail closed: the temporary credential may only initialise this absent package. */
export async function verifyFirstPublication({ packageName, tokenPresent }, fetchRegistry = fetch) {
  if (packageName !== '@plasius/learning-runtime' || !tokenPresent) {
    throw new Error('First publication requires the expected package and a production bootstrap credential.');
  }
  const response = await fetchRegistry('https://registry.npmjs.org/@plasius%2flearning-runtime', {
    signal: AbortSignal.timeout(10_000), redirect: 'error',
  });
  if (response.status !== 404) {
    throw new Error('Bootstrap requires a confirmed absent package; use trusted publication for existing packages.');
  }
}

/** Emit only a fixed operational error, never registry details or credentials. */
export async function runFirstPublication(input, verify = verifyFirstPublication, report = message => process.stderr.write(message)) {
  try {
    await verify(input);
    return 0;
  } catch {
    report('First-publication verification failed. Check package existence and the production bootstrap credential.\n');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runFirstPublication({ packageName: process.env.PACKAGE_NAME, tokenPresent: Boolean(process.env.NODE_AUTH_TOKEN) });
}
