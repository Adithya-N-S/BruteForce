# Deploy: NitroCloud Build & Deploy Pipeline Fix Plan

## Overview

This document describes every change required for the BruteForce monorepo to successfully build and run inside the NitroCloud Docker deployment pipeline. The pipeline uses a **generated Dockerfile** that cannot be customized. All fixes must be made within the repository's own `package.json` files, config files, and `.gitignore`.

---

## Understanding the NitroCloud Docker Pipeline

The NitroCloud builder generates a standard multi-stage Node.js Dockerfile. The build stage executes these steps **in this exact order**:

```dockerfile
# Stage 1: builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./                                          # Step 1
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi  # Step 2
COPY . .                                                       # Step 3
RUN npm run build --if-present                                 # Step 4
RUN npm prune --omit=dev                                       # Step 5

# Stage 2: production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache procps
COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
```

### Critical Constraint

`COPY package*.json ./` is a **flat glob**. It copies only the root-level `package.json` and `package-lock.json`. It does **NOT** recursively copy workspace subdirectory `package.json` files (`packages/core/package.json`, `packages/mcp-server/package.json`, etc.).

This means when `npm ci` runs at Step 2, npm sees the `"workspaces": ["packages/*"]` declaration but the workspace directories do not exist yet. npm falls back to installing only root-level dependencies. Workspace package dependencies (`graphology`, `@nitrostack/core`, `dotenv`, etc.) are **not installed**.

The workspace directories only appear after Step 3 (`COPY . .`), but `npm ci` has already run. Step 4 (`npm run build`) then fails because workspace dependencies are missing from `node_modules`.

---

## Required Changes

### Change 1: Root `package.json` — Add `npm install` to Build Script

**File:** `package.json` (repository root)

**Problem:** After `COPY . .` copies workspace directories into the container, the build script immediately runs `tsc` in workspace packages. But workspace dependencies were never installed because `npm ci` ran before workspace dirs existed.

**Fix:** Prepend `npm install` to the `build` script. This runs after `COPY . .` (Step 3), when all workspace `package.json` files are present, and properly installs all 268+ workspace dependencies.

```json
{
  "name": "bruteforce",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm install && npm run build --workspace=@bruteforce/core && npm run build --workspace=veilbreaker-mcp",
    "start": "npm run start --workspace=veilbreaker-mcp"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.19.0",
    "@types/node": "^26.1.1",
    "rimraf": "^6.0.0"
  }
}
```

**Why `devDependencies` in root:** Even though workspace packages declare their own `typescript`, `tsx`, etc., root-level `devDependencies` ensure these binaries are available in `node_modules/.bin/` during the initial `npm ci` phase (Step 2). Without them, `npm ci` produces an empty `.bin/` and `tsc` is not found.

**Why `@types/node` is `^26.1.1`:** The existing `package-lock.json` locks `@types/node` at `26.x`. If root `package.json` declares `^20.0.0`, `npm ci` detects a lockfile mismatch and aborts with `EUSAGE`. The version range must satisfy the locked version.

---

### Change 2: `packages/mcp-server/package.json` — Widget Sub-Project Build

**File:** `packages/mcp-server/package.json`

**Problem:** The MCP server has a nested Next.js widget sub-project at `src/widgets/`. This sub-project has its own `package.json` with dependencies (`next`, `react`, `react-dom`, `@nitrostack/widgets`) that are NOT part of the root npm workspace. Its dependencies must be installed separately before `next build` can run.

Additionally, `@nitrostack/core` expects statically exported HTML files at `src/widgets/out/<route>/index.html` for each widget route. Without building the widgets, the server crashes on startup with:
```
Error: Exported HTML for route 'evidence-graph' not found.
```

**Fix:** Update the `build` script to install widget dependencies and build the Next.js static export before running `tsc`:

```json
{
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "npm install --prefix src/widgets && npm run build --prefix src/widgets && tsc && node scripts/copy-seed.js",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "copy-seed": "node scripts/copy-seed.js"
  }
}
```

**Build order within `veilbreaker-mcp`:**
1. `npm install --prefix src/widgets` — Install Next.js, React, @nitrostack/widgets
2. `npm run build --prefix src/widgets` — Run `next build` → static export to `src/widgets/out/`
3. `tsc` — Compile MCP server TypeScript to `dist/`
4. `node scripts/copy-seed.js` — Copy seed JSON data files

---

### Change 3: `packages/mcp-server/src/widgets/next.config.mjs` — Static HTML Export

**File:** `packages/mcp-server/src/widgets/next.config.mjs`

**Problem:** `@nitrostack/core` loads widget UI by reading pre-rendered HTML from `src/widgets/out/<route>/index.html`. By default, `next build` only produces an internal `.next/` cache (server-side rendering artifacts), not static HTML files.

**Fix:** Enable static export with `output: 'export'` and `trailingSlash: true`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
};

export default nextConfig;
```

**Why `output: 'export'`:** Produces a fully static `out/` directory with pre-rendered HTML for each route.

**Why `trailingSlash: true`:** Without it, Next.js exports `out/evidence-graph.html` (flat file). With it, Next.js exports `out/evidence-graph/index.html` (directory-based). `@nitrostack/core` checks the directory-based path **first** (`out/<route>/index.html`), then falls back to the flat path (`out/<route>.html`). Using `trailingSlash: true` produces the canonical format NitroStack expects.

---

### Change 4: `packages/mcp-server/tsconfig.json` — Exclude Widget Source

**File:** `packages/mcp-server/tsconfig.json`

**Problem:** The MCP server uses `NodeNext` module resolution with `experimentalDecorators`. The widget sub-project uses `jsx: "preserve"` with `esnext` module resolution. If `tsc` tries to compile both, it produces conflicting errors.

**Fix:** Exclude `src/widgets` from the MCP server's TypeScript compilation:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": false,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/widgets"]
}
```

---

### Change 5: Widget TypeScript — `getToolOutput<any>()`

**File:** All widget `page.tsx` files under `packages/mcp-server/src/widgets/app/*/page.tsx`

**Problem:** The `@nitrostack/widgets` SDK hook `getToolOutput<T>()` defaults `T` to `{}` (empty object). When widget code accesses dynamic properties on the return value (e.g., `data.paths`, `output.scored`), TypeScript reports `TS2339: Property 'X' does not exist on type '{}'`.

**Fix:** In every widget component, call `getToolOutput<any>()` instead of `getToolOutput()`:

```tsx
// Before (errors)
const data = getToolOutput();

// After (works)
const data: any = getToolOutput<any>();
```

**Affected files:**
- `app/evidence-graph/page.tsx`
- `app/dossier-view/page.tsx`
- `app/source-card/page.tsx`
- `app/planner-log/page.tsx`

---

### Change 6: `.gitignore` — Exclude Build Artifacts

**File:** `.gitignore` (repository root)

**Problem:** Without gitignoring build artifacts, the following get committed:
- `dist/` — Compiled TypeScript output (regenerated by `tsc`)
- `.next/` — Next.js build cache (large, platform-specific)
- `out/` — Next.js static export (regenerated by `next build`)

These bloat the repository and can cause stale artifact issues in CI/CD.

**Fix:**

```gitignore
node_modules/
packages/data/raw/
dist/
.next/
out/
```

---

## Full Build Execution Order (What Docker Does)

```
Step 1: COPY package*.json ./
         → Only root package.json + package-lock.json in /app

Step 2: npm ci
         → Installs 15 root devDependencies (typescript, tsx, @types/node, rimraf)
         → Workspace dirs don't exist yet, so workspace deps are skipped

Step 3: COPY . .
         → All workspace dirs now exist: packages/core/, packages/mcp-server/, etc.

Step 4: npm run build
         ├── npm install
         │   → Resolves all workspaces, installs 268 packages (graphology, @nitrostack/core, etc.)
         │
         ├── npm run build --workspace=@bruteforce/core
         │   → tsc compiles packages/core/src/ → packages/core/dist/
         │
         └── npm run build --workspace=veilbreaker-mcp
             ├── npm install --prefix src/widgets
             │   → Installs next, react, react-dom, @nitrostack/widgets (36 packages)
             │
             ├── npm run build --prefix src/widgets
             │   → next build with output:'export' + trailingSlash:true
             │   → Produces src/widgets/out/evidence-graph/index.html
             │   → Produces src/widgets/out/dossier-view/index.html
             │   → Produces src/widgets/out/source-card/index.html
             │   → Produces src/widgets/out/planner-log/index.html
             │
             ├── tsc
             │   → Compiles packages/mcp-server/src/ → packages/mcp-server/dist/
             │   → Excludes src/widgets (separate tsconfig)
             │
             └── node scripts/copy-seed.js
                 → Copies entities.json, edges.json, source_records.json, sanctions_list.json

Step 5: npm prune --omit=dev
         → Removes devDependencies for smaller production image

Step 6: CMD ["npm", "start"]
         → npm run start --workspace=veilbreaker-mcp
         → node dist/index.js
         → @nitrostack/core loads widget HTML from src/widgets/out/
         → Server starts on STDIO transport
```

---

## Verification Checklist

After making all changes, verify locally by running these commands in order:

```bash
# 1. Clean slate (simulates fresh Docker container)
rm -rf node_modules packages/*/node_modules packages/mcp-server/src/widgets/node_modules

# 2. Simulate Docker Step 2 (root-only install)
npm ci

# 3. Simulate Docker Step 4 (full build)
npm run build

# 4. Verify widget HTML files exist
ls packages/mcp-server/src/widgets/out/evidence-graph/index.html
ls packages/mcp-server/src/widgets/out/dossier-view/index.html
ls packages/mcp-server/src/widgets/out/source-card/index.html
ls packages/mcp-server/src/widgets/out/planner-log/index.html

# 5. Verify server starts without errors
cd packages/mcp-server && node dist/index.js
# Should see: "All components compiled and registered"
# Should see: "bruteforce-mcp started successfully (STDIO transport)"
```

---

## Common Failure Modes Reference

| Error | Cause | Fix |
|---|---|---|
| `sh: tsc: not found` (exit 127) | `typescript` not in root `devDependencies` | Add `"typescript": "^5.5.0"` to root `package.json` `devDependencies` |
| `npm ci` EUSAGE lockfile mismatch | `@types/node` version in `package.json` doesn't match `package-lock.json` | Align version to `^26.1.1` (or run `npm install` to regenerate lockfile) |
| `Cannot find module 'graphology'` (TS2307) | Workspace deps not installed in Docker | Add `npm install` as first command in root `build` script |
| `Exported HTML for route 'X' not found` | Widget static export not built, or `output: 'export'` missing | Set `output: 'export'` in `next.config.mjs` and build widgets before server |
| `Property 'X' does not exist on type '{}'` (TS2339) | `getToolOutput()` defaults to `{}` return type | Use `getToolOutput<any>()` in widget components |
| `next: command not found` | Widget sub-project deps not installed in Docker | Add `npm install --prefix src/widgets` before `npm run build --prefix src/widgets` |
