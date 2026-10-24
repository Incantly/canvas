# Installing the private packages

The `@incantly/*` packages are published privately to
[GitHub Packages](https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
(`npm.pkg.github.com`), not to npmjs.org. They take their visibility from the
private `Incantly/canvas` repository: anyone who can read the repo can install
them, and nobody else can.

| Package | For |
| --- | --- |
| `@incantly/core` | Framework-free engine + toolbar |
| `@incantly/canvas-react` | `<Canvas />` component + hooks |
| `@incantly/canvas-react-native` | WebView component + typed bridge |

## Releasing

All packages share one version.

1. Set the same `version` in every `packages/*/package.json`, and update the
   internal `@incantly/core` dependency in the other packages to match.
2. Update the lockfile so `npm ci` in CI agrees with the new versions:

   ```bash
   npm install --package-lock-only
   ```

3. Update `CHANGELOG.md`, then commit and push.
4. Tag that commit with `v` + the version and push the tag:

   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

The [release workflow](../.github/workflows/release.yml) runs on the tag. It
fails unless the tag equals `v` + every package's version, then builds, tests
and typechecks the repo, and publishes with the built-in `GITHUB_TOKEN`. The
tag must point at a commit that contains the workflow file. You can also re-run
it from the Actions tab (**Run workflow**, choosing the tag as the ref).

Versions with a prerelease suffix (`0.3.0-beta.1`) are published under the
`next` dist-tag; install them with `npm install @incantly/core@next`.

To check a release locally without publishing:

```bash
npm run release        # writes publishable packages to .release/
```

`npm run release -- --publish` publishes from your machine. It needs
`NODE_AUTH_TOKEN` set to a classic token with `write:packages`.

## Installing in another project

### 1. Commit an `.npmrc`

Add this `.npmrc` next to the project's `package.json` and commit it. It
contains no secret, only a reference to an environment variable:

```ini
@incantly:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

npm, pnpm and Bun read this file. Yarn 2+ ignores it; put the same settings in
`.yarnrc.yml` under `npmScopes.incantly` (`npmRegistryServer` and
`npmAuthToken: ${GITHUB_PACKAGES_TOKEN}`).

npm stops with a "Failed to replace env in config" error if
`GITHUB_PACKAGES_TOKEN` is unset, so every machine that runs `npm install` in
the project needs it, even to install other packages.

### 2. Create a token

GitHub Packages' npm registry only accepts **classic** personal access tokens.
Fine-grained tokens don't work with it.

1. Open <https://github.com/settings/tokens/new> (Settings → Developer
   settings → Personal access tokens → Tokens (classic)).
2. Tick only **`read:packages`**. Pick an expiry and set a reminder to rotate
   the token.
3. If the Incantly org uses SAML single sign-on, click **Configure SSO** next to
   the token and authorize it for the org.

The account that owns the token needs read access to `Incantly/canvas`. For CI
and deploys, a token from a bot or machine account with read-only access is
better than a personal one.

### 3. Install

For local development, export the token in your shell profile:

```bash
export GITHUB_PACKAGES_TOKEN=ghp_xxx
```

Then install as usual:

```bash
npm install @incantly/canvas-react
```

## Deploying

**The token is only needed at install time.** It lets `npm install` / `npm ci`
download the packages, and nothing after that. Never pass it to the browser or
the running app:

- Don't give it a public prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`,
  `REACT_APP_`, `EXPO_PUBLIC_`…). Those values are inlined into client bundles.
- Don't add it as a runtime variable or secret of a server, Worker or
  container. Set it only where the build or install step can read it.

### Cloudflare Pages

Project → **Settings → Variables and Secrets**: add `GITHUB_PACKAGES_TOKEN`
with type **Secret**, for both Production and Preview. Pages exposes these to
the build, which runs `npm install` with the committed `.npmrc`.

### Cloudflare Workers Builds

Worker → **Settings → Build → Variables and secrets**: add
`GITHUB_PACKAGES_TOKEN` there. These *build* variables are separate from the
Worker's runtime **Variables and Secrets**, which you should leave alone. A
runtime secret would be readable by your Worker code and is not used for
installing.

### Vercel, Netlify, Render, Railway

Add `GITHUB_PACKAGES_TOKEN` as an environment variable in the project or
service settings. All four make these variables available to the install step:

- **Vercel**: Project → Settings → Environment Variables. Mark it Sensitive and
  enable it for Production and Preview.
- **Netlify**: Site configuration → Environment variables. Mark it secret, with
  the Builds scope.
- **Render**: Service → Environment.
- **Railway**: Service → Variables.

On these platforms the same variables also reach the running server. That's
harmless as long as your code never reads or prints the token. Where a
platform lets you scope a variable to builds only (Netlify's scopes, for
example), do so.

### GitHub Actions (in another repository)

Save the token as a repository or org secret, here `GITHUB_PACKAGES_TOKEN`, and
expose it only to the install step:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
  env:
    GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_PACKAGES_TOKEN }}
```

Alternatively, grant that repository read access to each package (package
page → **Package settings → Manage Actions access**) and use
`GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}` with
`permissions: packages: read` on the job.

### A VPS

Set the variable only for the install command, and keep it out of the app's
service unit or `.env`:

```bash
GITHUB_PACKAGES_TOKEN="$(cat ~/.config/incantly/packages-token)" npm ci
```

Make the file readable only by the deploy user (`chmod 600`).

### Docker

Pass the token as a BuildKit secret so it never lands in an image layer or in
`docker history`. Don't use `ARG` or `ENV` for it.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22 AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=github_packages_token \
    GITHUB_PACKAGES_TOKEN="$(cat /run/secrets/github_packages_token)" npm ci

FROM node:22
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["node", "server.js"]
```

```bash
docker build --secret id=github_packages_token,env=GITHUB_PACKAGES_TOKEN .
```

The secret is mounted only while that `RUN` step executes. The committed
`.npmrc` holds just the `${GITHUB_PACKAGES_TOKEN}` placeholder, so copying it
into the image is safe.
