# Administrator Guide

## Responsibilities and Architecture

SVG Draw Me is currently a static client-side application. There is no application server, database, account system, queue, or hosted integration to operate. Administrators or maintainers are responsible for the Node.js toolchain, dependency installation, static build output, and browser compatibility.

The application entry point is `src/main.ts`. The document model is in `src/document.ts` and `src/types.ts`; viewport transforms are in `src/coordinates.ts`; SVG output is in `src/svg.ts`.

## Prerequisites

- Node.js with npm.
- Git access to the repository.
- A modern browser for manual checks.

## Installation

```bash
npm install
npm run build
```

The production output is generated in `dist/`. A static web server can serve that directory. The repository does not currently define a deployment provider or hosting workflow.

For local development:

```bash
npm run dev
```

## Configuration

There are no environment variables or deployment secrets. Application defaults are source constants:

- Project size: 1200×800 in `src/document.ts`.
- Zoom bounds: 0.25–8 in `src/main.ts`.
- Vite configuration: `vite.config.ts`.
- TypeScript configuration: `tsconfig.json`.

If these values are changed, update the user guide and README configuration tables.

## Identity, Secrets, and TLS

Not applicable to the current static app. There is no identity provider, secret, API key, or server-side TLS configuration. Production hosting should use HTTPS and should apply the hosting provider's normal security headers.

## Storage and Backups

There is no server-side storage. Browser memory is the only working state. Users must download exports to retain work. Maintainers should back up the Git repository and release artifacts through the source-control provider.

## Health Checks and Monitoring

No health endpoint or telemetry is implemented. Operational checks are:

```bash
npm test
npm run build
```

After deployment, verify that the static entry point loads, the browser console has no initialization error, pointer drawing works, imports display, zoom works, and both download actions produce files.

## Upgrades and Rollback

Review dependency changes in `package.json` and `package-lock.json`, then run:

```bash
npm install
npm test
npm run build
```

Rollback is a source-control or static-artifact operation: restore the previous known-good commit/build and redeploy it. No database migration is required by the current application.

## Troubleshooting

### Build fails at type checking

Run `npm install` to restore the lockfile dependencies, then rerun `npm run build`. Inspect the first TypeScript error rather than suppressing it.

### Imported SVGs fail

Check the browser console and status line. SVGs are loaded through PixiJS's vector parser; advanced SVG features may exceed the parser's supported subset.

### Static hosting returns 404s

This is a single-page static app with `index.html` as its entry point. Configure the host to serve the generated `dist/` directory and provide the site root correctly.

## Security and Privacy Checklist

- Serve production builds over HTTPS.
- Do not add secrets to source, `dist/`, or documentation.
- Treat imported SVG markup as untrusted input.
- Keep external SVG/image references constrained or sanitized if a future server-side processing path is added.
- Avoid adding telemetry or uploads without documenting consent and data handling.
- Review dependency updates before release.

## Recovery and Support

Recovery consists of redeploying a known-good static artifact and directing users to download work before leaving the page. There is no server-side recovery for unsaved browser memory. Use the repository issue tracker for support and incident discussion.
