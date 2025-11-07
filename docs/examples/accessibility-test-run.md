# Example: Accessibility Test Run

Practical example of running automated accessibility scans using axe-core.

---

## Purpose

Demonstrate how to run WCAG 2.2 AA accessibility compliance scans against the frontend. Accessibility is a core tenet—all PRs touching UI code must pass axe scans before merge.

---

## Quick Start

```bash
cd frontend
npm install  # if dependencies not yet installed
npm run a11y
```

**What happens**:
1. Vite dev server starts on `http://localhost:5173`
2. axe-core scans the homepage
3. Violations reported to console + JSON artifact
4. Build fails if violations found (`--exit 1`)

---

## Command Breakdown

### Package.json Scripts

```json
{
  "scripts": {
    "a11y:serve": "vite --port 5173",
    "a11y:scan": "node ./scripts/run-axe.mjs",
    "a11y": "start-server-and-test a11y:serve http-get://localhost:5173 a11y:scan"
  }
}
```

**Explanation**:
- `a11y:serve` - Starts Vite dev server (frontend)
- `a11y:scan` - Runs axe-core scan script
- `a11y` - Orchestrates: start server → wait for ready → run scan → stop server

---

## Scan Script Details

**Location**: `frontend/scripts/run-axe.mjs`

The script:
1. Launches Playwright browser (headless)
2. Navigates to `http://localhost:5173`
3. Injects axe-core library
4. Runs accessibility audit
5. Reports violations (console + JSON file)
6. Exits with code 1 if violations found

---

## Example Output (Violations Found)

```
🔍 Running accessibility scan on http://localhost:5173...

❌ Accessibility violations found: 3

1. [critical] color-contrast
   Impact: serious
   Description: Elements must have sufficient color contrast
   Help: https://dequeuniversity.com/rules/axe/4.7/color-contrast
   Affected elements:
     - .hero-button

2. [serious] label
   Impact: critical
   Description: Form elements must have labels
   Help: https://dequeuniversity.com/rules/axe/4.7/label
   Affected elements:
     - #search-input

3. [moderate] region
   Impact: moderate
   Description: All page content must be contained by landmarks
   Help: https://dequeuniversity.com/rules/axe/4.7/region
   Affected elements:
     - .floating-widget

Full report saved to: frontend/axe-report.json

❌ Build failed: Accessibility violations detected
```

---

## Example Output (Pass)

```
🔍 Running accessibility scan on http://localhost:5173...

✅ No accessibility violations detected!

Full report saved to: frontend/axe-report.json
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File**: `.github/workflows/a11y.yml` (if exists; check workflows directory)

Runs on:
- PRs touching `frontend/**` files
- Manual workflow dispatch

Uploads `axe-report.json` as workflow artifact for review.

---

## Violation Severity Levels

| Level    | Impact                               | Examples                                |
| -------- | ------------------------------------ | --------------------------------------- |
| critical | Blocks screen readers entirely       | Missing alt text, unlabeled form fields |
| serious  | Major usability barriers             | Insufficient color contrast             |
| moderate | Usability issues for some users      | Missing landmarks, non-semantic markup  |
| minor    | Best practice violations             | Missing page title, redundant links     |

**Current policy**: Fail build on ANY violation (may relax to `critical + serious` later).

---

## Common Violations & Fixes

### 1. Color Contrast (color-contrast)
**Problem**: Text color too close to background color
**Fix**: Ensure contrast ratio ≥4.5:1 for normal text, ≥3:1 for large text

```css
/* ❌ Bad: insufficient contrast */
.button {
    color: #aaa;
    background: #fff;
}

/* ✅ Good: meets WCAG AA */
.button {
    color: #333;
    background: #fff;
}
```

### 2. Missing Form Labels (label)
**Problem**: Input fields without associated labels
**Fix**: Use `<label>` with `for` attribute or wrap input

```html
<!-- ❌ Bad: no label -->
<input type="text" id="username" />

<!-- ✅ Good: explicit label -->
<label for="username">Username</label>
<input type="text" id="username" />

<!-- ✅ Good: implicit label -->
<label>
  Username
  <input type="text" id="username" />
</label>
```

### 3. Missing Landmarks (region)
**Problem**: Content not contained in semantic regions
**Fix**: Use `<header>`, `<main>`, `<nav>`, `<footer>`, `<aside>`

```html
<!-- ❌ Bad: generic divs -->
<div class="header">...</div>
<div class="content">...</div>
<div class="footer">...</div>

<!-- ✅ Good: semantic landmarks -->
<header>...</header>
<main>...</main>
<footer>...</footer>
```

---

## Manual Testing Checklist

Automated scans catch many issues, but some require manual verification:

- [ ] **Keyboard navigation**: Can you reach all interactive elements with Tab?
- [ ] **Focus indicators**: Are focused elements clearly visible?
- [ ] **Screen reader**: Does content make sense when read linearly?
- [ ] **Live regions**: Do dynamic updates announce properly?
- [ ] **Skip link**: Does the "Skip to main content" link work?

---

## Tools & Extensions

### Browser DevTools
- **Chrome**: Lighthouse (Accessibility audit)
- **Firefox**: Accessibility Inspector
- **Edge**: Accessibility Insights

### Extensions
- **axe DevTools** (Chrome/Firefox): Interactive violation inspector
- **WAVE** (Chrome/Firefox): Visual feedback overlays
- **Accessibility Insights** (Chrome/Edge): Guided manual testing

---

## Related Examples

- [Example: Azure Function Endpoint](./function-endpoint-player.md)
- [Example: Seed Script Usage](./seed-script-usage.md)

---

## Related Documentation

| Topic                       | Document                                      |
| --------------------------- | --------------------------------------------- |
| Accessibility Guidelines    | `../ux/accessibility-guidelines.md`           |
| Tenets (Accessibility)      | `../tenets.md` (Section 6)                    |
| WCAG 2.2 AA Mapping         | `../ux/accessibility-guidelines.md#wcag-mapping` |

---

## Additional Resources

- [axe-core GitHub](https://github.com/dequelabs/axe-core)
- [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

_Last updated: 2025-11-07 (initial creation for MECE documentation hierarchy)_
