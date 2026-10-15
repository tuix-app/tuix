/**
 * Refuses an ambiguous release before a release workflow builds or publishes it.
 *
 * Environment: RELEASE_PACKAGE (widget, react, server, mcp, phoenix, rails or wordpress),
 * RELEASE_VERSION (the exact version committed in the package), PUBLISH (true or
 * false), and GitHub's GITHUB_REF, GITHUB_REPOSITORY and GITHUB_EVENT_PATH.
 * RELEASE_REPOSITORY names the public source repository when it is not the one the
 * workflow runs in (a preparation run in the private source repository). To publish,
 * RELEASE_ACTOR and RELEASE_TRIGGERING_ACTOR (github.actor and github.triggering_actor)
 * must both be in .github/release-actors (RELEASE_ACTORS_FILE overrides the path).
 */
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** For each package: its committed version and whether its metadata names the source repository. */
const packages = {
  widget: npm('widget'),
  react: npm('react'),
  server: npm('server'),
  mcp: npm('mcp'),
  phoenix: {
    async version() { return (await read('packages/phoenix/mix.exs')).match(/^\s*version: "([^"]+)",$/m)?.[1]; },
    async names(repository) {
      return (await read('packages/phoenix/mix.exs')).includes(`"https://github.com/${repository}/tree/main/packages/phoenix"`);
    },
  },
  rails: {
    async version() { return (await read('packages/rails/lib/tuix_rails/version.rb')).match(/^\s*VERSION = "([^"]+)"$/m)?.[1]; },
    async names(repository) {
      return (await read('packages/rails/tuix_rails.gemspec')).includes(`"https://github.com/${repository}/tree/main/packages/rails"`);
    },
  },
  wordpress: {
    async version() { return (await read('apps/wordpress/tuix-feedback/tuix-feedback.php')).match(/^ \* Version:\s+(\S+)$/m)?.[1]; },
    async names(repository) { return (await read('apps/wordpress/tuix-feedback/readme.txt')).includes(`https://github.com/${repository}`); },
    async publishable() {
      const readme = await read('apps/wordpress/tuix-feedback/readme.txt');
      if (/^Contributors:.*PLACEHOLDER/m.test(readme)) {
        return 'readme.txt still has the Contributors placeholder. Put the wordpress.org username there first.';
      }
      return null;
    },
  },
};

function npm(name) {
  const manifest = async () => JSON.parse(await read(`packages/${name}/package.json`));
  return {
    async version() { return (await manifest()).version; },
    async names(repository) {
      const { repository: source, private: unpublishable } = await manifest();
      return !unpublishable && source?.url === `git+https://github.com/${repository}.git` && source?.directory === `packages/${name}`;
    },
  };
}

/** The GitHub logins that may publish, lowercased: one per line, # starts a comment. */
async function actors(file) {
  let text = '';
  try { text = await readFile(file ?? new URL('.github/release-actors', root), 'utf8'); } catch {}
  return new Set(text.split('\n').flatMap(line => line.replace(/#.*/, '').trim().split(/\s+/)).filter(Boolean)
    .map(login => login.toLowerCase()));
}

export async function validate(env) {
  if (!Object.hasOwn(packages, env.RELEASE_PACKAGE ?? '')) {
    throw new Error(`RELEASE_PACKAGE must be one of ${Object.keys(packages).join(', ')}.`);
  }
  const target = packages[env.RELEASE_PACKAGE];
  const version = env.RELEASE_VERSION;
  if (!semver.test(version ?? '') || version !== await target.version()) {
    throw new Error(`RELEASE_VERSION must be exactly the version committed in ${env.RELEASE_PACKAGE}.`);
  }
  if (env.GITHUB_REF !== 'refs/heads/main') throw new Error('A release runs from main only.');
  if (!['true', 'false'].includes(env.PUBLISH)) throw new Error('PUBLISH must be true or false.');
  const repository = env.RELEASE_REPOSITORY || env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !await target.names(repository)) {
    throw new Error(`The package metadata must name the source repository ${repository} (repository, links or source_code_uri).`);
  }
  if (env.PUBLISH === 'true') {
    if (env.RELEASE_REPOSITORY && env.RELEASE_REPOSITORY !== env.GITHUB_REPOSITORY) {
      throw new Error('Publish only from the public source repository itself.');
    }
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    // npm provenance needs a public source repository; so does a reviewable release.
    if (event.repository?.private !== false) throw new Error('Publishing needs a public source repository.');
    const problem = await target.publishable?.();
    if (problem) throw new Error(problem);
    const allowed = await actors(env.RELEASE_ACTORS_FILE);
    for (const actor of [env.RELEASE_ACTOR, env.RELEASE_TRIGGERING_ACTOR]) {
      if (!actor || !allowed.has(actor.toLowerCase())) {
        throw new Error(`${actor || 'An unnamed actor'} may not publish. The logins that may are in .github/release-actors.`);
      }
    }
  }
  return { package: env.RELEASE_PACKAGE, version, publish: env.PUBLISH === 'true' };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const result = await validate(process.env);
    console.log(`Validated ${result.package} ${result.version}; publish=${result.publish}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
