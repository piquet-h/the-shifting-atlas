#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
/**
 * run-axe.mjs
 * Wrapper around @axe-core/cli to avoid intermittent Chrome/WebDriver second phantom URL scan ("http://1")
 * causing a non-zero exit after a successful primary scan. We:
 *  1. Invoke axe with --exit 0 (never fail automatically)
 *  2. Read generated report JSON in ./axe-report
 *  3. Aggregate violation counts and fail (exit 1) only if there are violations
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const reportDir = join(process.cwd(), 'axe-report');
const url = 'http://localhost:5173';

let axeOk = true;
try {
    // --exit 0 ensures CLI network quirks do not fail build prematurely
    execSync(`npx axe ${url} --exit 0 --dir ./axe-report --save`, { stdio: 'inherit' });
} catch {
    // We purposely ignore errors here; evaluation happens below.
    axeOk = false; // keep flag for diagnostics
}

let violationsTotal = 0;
let details = [];
try {
    const files = readdirSync(reportDir).filter(f => f.endsWith('.json'));
    for (const f of files) {
        const json = JSON.parse(readFileSync(join(reportDir, f), 'utf-8'));
        if (Array.isArray(json.violations)) {
            for (const v of json.violations) {
                violationsTotal += v.nodes?.length || 0;
                details.push({ id: v.id, impact: v.impact, count: v.nodes?.length || 0 });
            }
        }
    }
} catch (e) {
    console.error('Failed to read axe reports:', e);
    process.exit(2);
}

if (violationsTotal > 0) {
    console.error(`Accessibility violations detected: ${violationsTotal}`);
    const summarized = details
        .sort((a, b) => b.count - a.count)
        .map(d => `${d.id} (${d.impact || 'n/a'}): ${d.count}`)
        .join('\n  ');
    console.error('Breakdown:\n  ' + summarized);
    process.exit(1);
}

if (!axeOk) {
    console.warn(
        'axe CLI reported an internal error, but no violations were found. Treating as pass.',
    );
}
console.log('axe scan complete: no violations.');
process.exit(0);
