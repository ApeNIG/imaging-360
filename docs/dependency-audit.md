# Dependency Audit Report

**Date:** 2026-01-14
**Auditor:** Claude Code

## Summary

| Category | Count |
|----------|-------|
| Critical vulnerabilities | 1 |
| High vulnerabilities | 4 |
| Moderate vulnerabilities | 2 |
| Low vulnerabilities | 2 |
| Outdated packages | 4 |

---

## Security Vulnerabilities

### Critical

| Package | Vulnerability | Current | Fix |
|---------|--------------|---------|-----|
| `@remix-run/node` | Path Traversal in File Session Storage | 1.19.3 | >=2.17.2 |

**Source:** `@expo/server@0.3.1` → `@remix-run/node@1.19.3`
**Impact:** Mobile app's Expo dependency pulls this in transitively
**Fix:** Upgrade to Expo SDK 51+ or add pnpm override

### High

| Package | Vulnerability | Current | Fix |
|---------|--------------|---------|-----|
| `semver` | ReDoS | 7.3.2, 7.5.3 | >=7.5.2 |
| `ip` | SSRF improper categorization | <=2.0.1 | No patch |
| `qs` | DoS via memory exhaustion | 6.14.0 | >=6.14.1 |
| `@remix-run/router` | XSS via Open Redirects | 1.23.1, 1.7.2 | >=1.23.2 |

### Moderate

| Package | Vulnerability | Current | Fix |
|---------|--------------|---------|-----|
| `esbuild` | Dev server security | 0.21.5 | >=0.25.0 |
| `@remix-run/server-runtime` | CSRF in Actions | 1.19.3 | >=2.17.3 |

### Low

| Package | Vulnerability | Current | Fix |
|---------|--------------|---------|-----|
| `cookie` | Out of bounds characters | 0.4.2 | >=0.7.0 |
| `send` | Template injection XSS | 0.18.0 | >=0.19.0 |

---

## Outdated Packages

| Package | Current | Wanted | Latest | Location |
|---------|---------|--------|--------|----------|
| `prettier` | 3.7.4 | 3.7.4 | 3.7.4 | root |
| `turbo` | 2.7.2 | 2.7.2 | 2.7.4 | root |
| `typescript` | 5.9.3 | 5.9.3 | 5.9.3 | root |
| `@types/node` | 20.19.27 | 20.19.27 | 25.0.8 | root |

*Note: Versions shown are from lockfile. Specifiers in package.json use caret ranges.*

---

## Bloat Analysis

### Duplicate Dependencies Across Workspaces

These dependencies appear in multiple workspace packages:

| Package | Workspaces |
|---------|------------|
| `@aws-sdk/client-s3` | api, worker |
| `dotenv` | api, worker |
| `pg` | api, worker |
| `pino` | api, worker |
| `typescript` | root, api, portal, worker, shared, mobile |
| `eslint` | api, portal, worker, mobile |
| `vitest` | api, portal, worker, shared |

**Assessment:** This is acceptable for a pnpm monorepo. pnpm hoists shared dependencies efficiently. However, consider moving common devDependencies to root.

### Large Dependencies

| Package | Size Impact | Necessity |
|---------|-------------|-----------|
| `sharp` | ~25MB native | Required for image processing |
| `@aws-sdk/*` | ~5MB each | Required for S3/SQS |
| `expo-*` | Large (SDK) | Required for RN/Expo |

---

## Recommendations

### Priority 1: Critical Security Fixes

1. **Add pnpm overrides** to force patched versions:

```json
// root package.json
{
  "pnpm": {
    "overrides": {
      "qs": ">=6.14.1",
      "semver": ">=7.5.2",
      "cookie": ">=0.7.0",
      "send": ">=0.19.0",
      "@remix-run/router": ">=1.23.2"
    }
  }
}
```

2. **Upgrade Expo SDK** from 50 to 52 (latest):
   - Fixes `@remix-run/*` vulnerabilities
   - Brings security patches for `@expo/server`
   - Requires testing mobile app thoroughly

3. **Upgrade Express to 5.x** (when stable):
   - Express 5.0.0 was released but consider waiting for 5.1.x
   - Alternatively, verify 4.22.1 addresses `qs` and `send` issues

### Priority 2: Update Outdated Packages

```bash
# Update root devDependencies
pnpm update -r typescript@latest prettier@latest turbo@latest

# Keep @types/node on v20 for Node 20 compatibility
pnpm update @types/node@^20
```

### Priority 3: Reduce Duplication

1. **Hoist common devDependencies to root:**

```json
// root package.json - add:
{
  "devDependencies": {
    "eslint": "^9.0.0",
    "vitest": "^2.0.0"
  }
}
```

Then remove from individual packages.

2. **Consider ESLint 9.x upgrade:**
   - ESLint 8.x is in maintenance mode
   - Requires migrating to flat config format
   - Can be done incrementally

### Priority 4: Future Considerations

1. **React Native 0.76+** - New Architecture is stable
2. **Expo SDK 52** - Better security, performance
3. **Vite 6.x** - When available, includes esbuild fixes
4. **Consider Bun** - For worker service (faster cold starts)

---

## Action Items

- [ ] Add pnpm overrides for vulnerable transitive deps
- [ ] Upgrade Expo SDK 50 → 52 in mobile app
- [ ] Test thoroughly after Expo upgrade
- [ ] Upgrade ESLint 8 → 9 (low priority)
- [ ] Monitor Express 5.x stability

---

## References

- [GHSA-9583-h5hc-x8cw](https://github.com/advisories/GHSA-9583-h5hc-x8cw) - React Router Path Traversal
- [GHSA-c2qf-rxjj-qqgw](https://github.com/advisories/GHSA-c2qf-rxjj-qqgw) - semver ReDoS
- [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) - ip SSRF
- [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p) - qs DoS
- [GHSA-2w69-qvjg-hvjx](https://github.com/advisories/GHSA-2w69-qvjg-hvjx) - React Router XSS
