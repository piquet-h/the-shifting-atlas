#!/usr/bin/env node
/* eslint-env node */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
    buildClaimComment,
    computeMilestoneSnapshot,
    evaluateReadinessAndBuildVerifier,
    evaluateVerifierOutcome,
    fingerprintTelemetryCluster,
    parseVerifierBlock,
    planStoppedRunClaimRelease,
    rankOpenMilestones
} from '../lib/milestone-board.mjs'

describe('milestone-board', () => {
    test('rankOpenMilestones sorts by semantic M<num><subletter> stage ahead of raw GitHub milestone number', () => {
        const milestones = [
            { number: 9, title: 'M7 Post-MVP Extensibility', open_issues: 13 },
            { number: 17, title: 'M5b Layering', open_issues: 83 },
            { number: 23, title: 'M4e Long Reach Authoring Readiness & Expansion Queue', open_issues: 2 },
            { number: 16, title: 'M5a Observability', open_issues: 17 }
        ]

        const ranked = rankOpenMilestones(milestones)
        assert.deepEqual(
            ranked.map((m) => m.title),
            ['M4e Long Reach Authoring Readiness & Expansion Queue', 'M5a Observability', 'M5b Layering', 'M7 Post-MVP Extensibility']
        )
    })

    test('computeMilestoneSnapshot enforces dependency blocking, milestone slice order, and right-to-left WIP limits', () => {
        const milestone = {
            number: 16,
            title: 'M5a Observability',
            description: [
                '## Delivery slices',
                '',
                'Order:',
                '1. #102 — Second by number, first in slice order',
                '2. #101 — Depends on #102',
                '3. #103 — Ready item',
                '4. #104 — New unrefined item',
                '5. #105 — Blocked by open #103'
            ].join('\n')
        }

        const issues = [
            {
                number: 100,
                title: 'Observability Epic',
                state: 'open',
                labels: [{ name: 'scope:observability' }, { name: 'epic' }],
                body: ''
            },
            {
                number: 102,
                title: 'Testing item',
                state: 'open',
                labels: [{ name: 'scope:observability' }, { name: 'feature' }, { name: 'state:testing' }],
                body: '- [ ] AC 1'
            },
            {
                number: 101,
                title: 'In-progress item',
                state: 'open',
                labels: [{ name: 'scope:observability' }, { name: 'feature' }, { name: 'state:in-progress' }],
                body: '- [ ] AC 1'
            },
            {
                number: 103,
                title: 'Ready item',
                state: 'open',
                labels: [{ name: 'scope:observability' }, { name: 'feature' }, { name: 'state:ready' }],
                body: '- [ ] AC 1'
            },
            {
                number: 104,
                title: 'Unlabeled new atomic issue',
                state: 'open',
                labels: [{ name: 'scope:observability' }, { name: 'enhancement' }],
                body: '- [ ] AC 1'
            },
            {
                number: 105,
                title: 'Blocked ready item',
                state: 'open',
                labels: [{ name: 'scope:observability' }, { name: 'feature' }, { name: 'state:ready' }],
                blockedBy: [103],
                body: 'Blocked by #103\n- [ ] AC 1'
            }
        ]

        const snapshot = computeMilestoneSnapshot({
            milestone,
            issues,
            wipLimits: { inProgress: 3, ready: 5 }
        })

        assert.deepEqual(
            snapshot.columns.testing.map((i) => i.number),
            [102]
        )
        assert.deepEqual(
            snapshot.columns.inProgress.map((i) => i.number),
            [101]
        )
        assert.deepEqual(
            snapshot.columns.ready.map((i) => i.number),
            [103, 105]
        )
        assert.deepEqual(
            snapshot.columns.new.map((i) => i.number),
            [104]
        )
        // #105 is blocked by open #103, so only #103 is eligible for pullToBuild!
        assert.deepEqual(
            snapshot.pullToBuild.map((i) => i.number),
            [103]
        )
        assert.deepEqual(
            snapshot.pullToRefine.map((i) => i.number),
            [104]
        )
    })

    test('evaluateReadinessAndBuildVerifier promotes clear atomic issues and appends tailored ## Verifier JSON', () => {
        const backendIssue = {
            number: 201,
            title: 'Add partition pressure metric emitter',
            labels: [{ name: 'scope:observability' }, { name: 'feature' }],
            body: 'Summary: Emit partition metric.\n\nAcceptance Criteria:\n- [ ] Emits metric on hot partition\n- [ ] Unit test covers threshold'
        }

        const result = evaluateReadinessAndBuildVerifier(backendIssue)
        assert.equal(result.ready, true)
        assert.match(result.updatedBody, /## Verifier/)
        const parsed = parseVerifierBlock(result.updatedBody)
        assert.equal(parsed.kind, 'app-insights-zero-regressions')

        const oversizedIssue = {
            number: 202,
            title: 'Oversized 12-item checklist issue',
            labels: [{ name: 'scope:world' }, { name: 'feature' }],
            body: Array.from({ length: 12 }, (_, idx) => `- [ ] Item ${idx + 1}`).join('\n')
        }
        const rejected = evaluateReadinessAndBuildVerifier(oversizedIssue)
        assert.equal(rejected.ready, false)
        assert.equal(rejected.reason, 'exceeds-10-acceptance-criteria')
    })

    test('planStoppedRunClaimRelease releases only claims matching stopped run+attempt with no open PR', () => {
        const claimBody = buildClaimComment({
            runId: 555001,
            runAttempt: 2,
            worker: 1,
            owner: 'milestone-sweep'
        })
        const issue = {
            number: 301,
            state: 'open',
            labels: [{ name: 'scope:backend' }, { name: 'feature' }, { name: 'state:in-progress' }]
        }

        // Different run ID -> keep claim
        const wrongRun = planStoppedRunClaimRelease({
            issue,
            comments: [{ body: claimBody }],
            completedRunId: 999999,
            completedAttempt: 2,
            hasOpenPr: false
        })
        assert.equal(wrongRun.release, false)

        // Matching run+attempt, but PR already opened -> keep state:in-progress
        const withPr = planStoppedRunClaimRelease({
            issue,
            comments: [{ body: claimBody }],
            completedRunId: 555001,
            completedAttempt: 2,
            hasOpenPr: true
        })
        assert.equal(withPr.release, false)

        // Matching run+attempt, no open PR -> release back to state:ready
        const shouldRelease = planStoppedRunClaimRelease({
            issue,
            comments: [{ body: claimBody }],
            completedRunId: 555001,
            completedAttempt: 2,
            hasOpenPr: false
        })
        assert.equal(shouldRelease.release, true)
        assert.deepEqual(shouldRelease.nextLabels, ['scope:backend', 'feature', 'state:ready'])
    })

    test('evaluateVerifierOutcome closes proven backend issues, holds UI issues for operator, and returns regressions to in-progress', () => {
        const backendTestingIssue = {
            number: 401,
            state: 'open',
            labels: [{ name: 'scope:backend' }, { name: 'feature' }, { name: 'state:testing' }],
            body: '## Verifier\n```json\n{"kind":"app-insights-zero-regressions","endpoint":"/api/player"}\n```'
        }

        const passed = evaluateVerifierOutcome({
            issue: backendTestingIssue,
            healthOk: true,
            exceptionCount: 0,
            ciGreen: true
        })
        assert.equal(passed.disposition, 'close-proven')

        const regressed = evaluateVerifierOutcome({
            issue: backendTestingIssue,
            healthOk: false,
            exceptionCount: 3,
            ciGreen: true
        })
        assert.equal(regressed.disposition, 'return-in-progress')

        const uiIssue = {
            number: 402,
            state: 'open',
            labels: [{ name: 'scope:frontend' }, { name: 'feature' }, { name: 'state:testing' }],
            body: '## Verifier\n```json\n{"kind":"http-200-and-operator-ui","requiresOperatorSignoff":true}\n```'
        }
        const held = evaluateVerifierOutcome({
            issue: uiIssue,
            healthOk: true,
            exceptionCount: 0,
            ciGreen: true
        })
        assert.equal(held.disposition, 'await-operator')
    })

    test('fingerprintTelemetryCluster produces stable 16-hex deduplication keys ignoring dynamic GUIDs', () => {
        const fp1 = fingerprintTelemetryCluster({
            type: 'exception',
            name: 'HttpMovePlayer',
            problemId: 'CosmosTimeout',
            outerMessage: 'Timeout reading player a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21'
        })
        const fp2 = fingerprintTelemetryCluster({
            type: 'exception',
            name: 'HttpMovePlayer',
            problemId: 'CosmosTimeout',
            outerMessage: 'Timeout reading player f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53'
        })
        assert.equal(fp1, fp2)
        assert.equal(fp1.length, 16)
    })
})
