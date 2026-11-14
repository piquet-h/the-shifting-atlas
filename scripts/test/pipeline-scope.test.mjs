#!/usr/bin/env node
/* eslint-env node */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { matchGlob, resolveDeployUnitAffected, resolveValidationScope } from '../lib/pipeline-scope.mjs'
import { buildTestingTransitionPlan, extractReferencedIssueNumbers } from '../lib/release-handoff.mjs'

const SAMPLE_MANIFEST = {
    version: 1,
    validationLanes: {
        shared: {
            include: ['shared/**', 'package.json', 'package-lock.json', 'tsconfig.base.json']
        },
        backend: {
            include: ['backend/**', 'shared/**', 'package.json', 'package-lock.json', 'scripts/package-backend-function.mjs']
        },
        frontend: {
            include: ['frontend/**', 'shared/**', 'package.json', 'package-lock.json']
        },
        a11y: {
            include: ['frontend/**', 'docs/ux/**']
        },
        infrastructure: {
            include: ['infrastructure/**', 'scripts/observability/**']
        },
        governance: {
            include: ['**/*']
        }
    },
    deployUnits: {
        backend: {
            include: ['backend/**', 'shared/**', 'package.json', 'package-lock.json', 'scripts/package-backend-function.mjs'],
            exclude: ['backend/test/**', 'shared/test/**', '**/*.test.*', '**/*.md', 'backend/eslint.config.mjs']
        },
        frontend: {
            include: ['frontend/**', 'shared/**', 'package.json', 'package-lock.json'],
            exclude: ['frontend/test/**', 'frontend/e2e/**', 'shared/test/**', '**/*.test.*', '**/*.md']
        },
        infrastructure: {
            include: ['infrastructure/**'],
            exclude: ['**/*.md']
        }
    }
}

describe('pipeline-scope', () => {
    test('matchGlob handles nested globs, wildcards, and exact paths', () => {
        assert.equal(matchGlob('backend/src/functions/Move.ts', 'backend/**'), true)
        assert.equal(matchGlob('backend/test/unit/move.test.ts', '**/*.test.*'), true)
        assert.equal(matchGlob('infrastructure/main.bicep', 'infrastructure/*.bicep'), true)
        assert.equal(matchGlob('docs/architecture/foo.md', 'backend/**'), false)
    })

    test('resolveValidationScope fans out shared changes to shared, backend, frontend, and a11y/governance as configured', () => {
        const scope = resolveValidationScope(['shared/src/domainModels.ts'], SAMPLE_MANIFEST)
        assert.deepEqual(scope.lanes, ['backend', 'frontend', 'governance', 'shared'])
        assert.deepEqual(scope.formatterFiles, ['shared/src/domainModels.ts'])
    })

    test('resolveValidationScope keeps docs-only changes to governance lane (plus a11y if docs/ux)', () => {
        const docsOnly = resolveValidationScope(['docs/architecture/overview.md'], SAMPLE_MANIFEST)
        assert.deepEqual(docsOnly.lanes, ['governance'])

        const uxDocs = resolveValidationScope(['docs/ux/accessibility.md'], SAMPLE_MANIFEST)
        assert.deepEqual(uxDocs.lanes, ['a11y', 'governance'])
    })

    test('resolveValidationScope selects changed bicep templates when infrastructure changes', () => {
        const scope = resolveValidationScope(['infrastructure/alert-ru-utilization.bicep', 'infrastructure/README.md'], SAMPLE_MANIFEST)
        assert.ok(scope.lanes.includes('infrastructure'))
        assert.deepEqual(scope.bicepFiles, ['infrastructure/alert-ru-utilization.bicep'])
    })

    test('resolveDeployUnitAffected skips test-only and markdown-only edits while catching shared/runtime edits', () => {
        const testEdit = resolveDeployUnitAffected({
            unit: 'backend',
            changedFiles: ['backend/test/unit/move.test.ts', 'backend/README.md'],
            manifest: SAMPLE_MANIFEST
        })
        assert.equal(testEdit.affected, false)

        const sharedRuntimeEdit = resolveDeployUnitAffected({
            unit: 'backend',
            changedFiles: ['shared/src/telemetryEvents.ts'],
            manifest: SAMPLE_MANIFEST
        })
        assert.equal(sharedRuntimeEdit.affected, true)
        assert.deepEqual(sharedRuntimeEdit.matchingFiles, ['shared/src/telemetryEvents.ts'])
    })
})

describe('release-handoff', () => {
    test('extractReferencedIssueNumbers captures issue refs while ignoring Merge pull request headlines', () => {
        const commits = [
            'Merge pull request #1073 from piquet-h/feat/layering\n\nfeat(backend): add layer cache (Refs #941, Delivers #942)',
            'fix(frontend): wire command output (#926)'
        ]
        assert.deepEqual(extractReferencedIssueNumbers(commits), [926, 941, 942])
    })

    test('buildTestingTransitionPlan swaps state:* labels to state:testing and skips PRs, closed issues, and epics', () => {
        const openAtomic = buildTestingTransitionPlan({
            issue: {
                number: 941,
                state: 'open',
                labels: [{ name: 'scope:world' }, { name: 'feature' }, { name: 'state:in-progress' }]
            },
            unit: 'backend',
            commitSha: '1234567890abcdef1234567890abcdef12345678',
            runUrl: 'https://github.com/piquet-h/the-shifting-atlas/actions/runs/999'
        })
        assert.equal(openAtomic.eligible, true)
        assert.deepEqual(openAtomic.nextLabels, ['scope:world', 'feature', 'state:testing'])
        assert.match(openAtomic.commentMarker, /shifting-atlas-deploy-receipt:backend:1234567890abcdef/)

        const epicIssue = buildTestingTransitionPlan({
            issue: {
                number: 900,
                state: 'open',
                labels: [{ name: 'scope:world' }, { name: 'epic' }]
            },
            unit: 'backend',
            commitSha: '1234567890abcdef1234567890abcdef12345678',
            runUrl: 'https://github.com/piquet-h/the-shifting-atlas/actions/runs/999'
        })
        assert.equal(epicIssue.eligible, false)

        const prObject = buildTestingTransitionPlan({
            issue: {
                number: 1073,
                state: 'open',
                pull_request: { url: 'https://api.github.com/...' },
                labels: []
            },
            unit: 'backend',
            commitSha: '1234567890abcdef1234567890abcdef12345678',
            runUrl: 'https://github.com/piquet-h/the-shifting-atlas/actions/runs/999'
        })
        assert.equal(prObject.eligible, false)
    })
})
