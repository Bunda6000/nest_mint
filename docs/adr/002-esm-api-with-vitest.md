# ADR-002: ESM API, Vitest everywhere

**Status:** Accepted · **Date:** 2026-11-07

**Context:** NestJS 12 ships as ES modules only; Jest cannot load it without extra transforms.

**Decision:** The API is an ES module package (`"type": "module"`, NodeNext resolution, `.js` import suffixes). All packages test with Vitest; the API uses `unplugin-swc` so decorator metadata (needed by NestJS dependency injection) is preserved.

**Consequences:** One test runner and config style across the repo. Relative imports in the API must end in `.js`.
