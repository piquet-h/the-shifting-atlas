#!/usr/bin/env node
/* eslint-env node */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function findRepoRoot(startDir) {
    let current = startDir
    while (true) {
        const candidate = resolve(current, '.github')
        if (existsSync(candidate)) return current
        const parent = dirname(current)
        if (parent === current) return startDir
        current = parent
    }
}

const ROOT = process.env.VERIFY_RUNTIME_INVARIANTS_ROOT
    ? resolve(process.env.VERIFY_RUNTIME_INVARIANTS_ROOT)
    : findRepoRoot(process.cwd())
const CONSUMER_PACKAGES = ['backend/package.json', 'frontend/package.json']
const SHARED_PACKAGE_NAME = '@piquet-h/shared'
const DATA_FILES = {
    villageLocations: 'backend/src/data/villageLocations.json',
    longReachAtlas: 'backend/src/data/theLongReachMacroAtlas.json',
    mosswellAtlas: 'backend/src/data/mosswellMacroAtlas.json'
}
const ISSUE_TYPES = [
    'shared-file-reference',
    'seed-location-id-format',
    'seed-exit-target-id-format',
    'atlas-semantic-id-format',
    'atlas-reference-integrity',
    'atlas-node-count-threshold',
    'atlas-transition-invalid',
    'atlas-transition-reference-integrity',
    'atlas-transition-contradiction'
]
// ADR-010 revisit trigger T4: if either atlas file exceeds this node count, in-process
// O(n) scan performance becomes measurable and Gremlin promotion should be re-evaluated.
// See: docs/adr/ADR-010-macro-geography-persistence-strategy.md, issue #984.
const ATLAS_NODE_COUNT_WARN_THRESHOLD = 200
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_DIRECTIONS = new Set(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out'])
const VALID_READINESS_STATES = new Set(['ready', 'partial', 'blocked', 'deferred'])

function readJson(relativePath) {
    return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'))
}

function readOptionalJson(relativePath) {
    const absolutePath = resolve(ROOT, relativePath)
    if (!existsSync(absolutePath)) return undefined
    return JSON.parse(readFileSync(absolutePath, 'utf8'))
}

function isGuid(value) {
    return typeof value === 'string' && GUID_PATTERN.test(value)
}

function pushIssue(issues, issue) {
    issues.push(issue)
}

function collectSeedIdIssues(issues) {
    const locations = readOptionalJson(DATA_FILES.villageLocations)
    if (!Array.isArray(locations)) return

    for (const location of locations) {
        if (!isGuid(location?.id)) {
            pushIssue(issues, {
                type: 'seed-location-id-format',
                file: DATA_FILES.villageLocations,
                locationName: location?.name,
                value: location?.id,
                message: `${DATA_FILES.villageLocations} location "${location?.name || '<unknown>'}" must use a GUID id; found ${JSON.stringify(location?.id)}.`
            })
        }

        for (const exit of Array.isArray(location?.exits) ? location.exits : []) {
            if (!isGuid(exit?.to)) {
                pushIssue(issues, {
                    type: 'seed-exit-target-id-format',
                    file: DATA_FILES.villageLocations,
                    locationName: location?.name,
                    direction: exit?.direction,
                    value: exit?.to,
                    message:
                        `${DATA_FILES.villageLocations} exit target for location "${location?.name || '<unknown>'}"` +
                        ` direction "${exit?.direction || '<unknown>'}" must use a GUID id; found ${JSON.stringify(exit?.to)}.`
                })
            }
        }
    }
}

function validateSemanticAtlasReference(issues, file, fieldPath, value) {
    if (typeof value !== 'string') return

    if (isGuid(value)) {
        pushIssue(issues, {
            type: 'atlas-semantic-id-format',
            file,
            fieldPath,
            value,
            message: `${file} uses GUID ${JSON.stringify(value)} for ${fieldPath}; expected a semantic atlas reference key instead of a runtime GUID.`
        })
    }
}

function validateReferenceMembership(issues, file, fieldPath, value, validValues, referenceKind) {
    if (typeof value !== 'string') return
    if (!validValues.has(value)) {
        pushIssue(issues, {
            type: 'atlas-reference-integrity',
            file,
            fieldPath,
            value,
            message: `${file} references unknown ${referenceKind} ${JSON.stringify(value)} at ${fieldPath}.`
        })
    }
}

/**
 * Validate transition metadata on a macro-transition edge.
 *
 * Checks:
 *   - Required fields are present (direction, threshold, destinationAreaRef, destinationReadiness).
 *   - `direction` is a known Direction value.
 *   - `destinationReadiness` is a valid AreaReadinessState value.
 *   - Neither `direction` nor `destinationAreaRef` uses a runtime GUID.
 *   - `destinationAreaRef` references a real node across all known atlases.
 *   - `entrySegmentRef` and `handoffRouteRef`, when present, are not runtime GUIDs.
 *   - If `requiresRouteHandoff` is true, `handoffRouteRef` must also be present.
 *   - Contradiction: `traversal` is `'blocked'` but `destinationReadiness` is `'ready'`.
 */
function validateTransitionMetadata(issues, file, edgeFieldPath, transition, traversal, allAtlasNodeIds) {
    if (!transition || typeof transition !== 'object') {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: edgeFieldPath + '.transition',
            message: `${file} macro-transition edge at ${edgeFieldPath} is missing a "transition" object.`
        })
        return
    }

    const fieldPath = edgeFieldPath + '.transition'

    // Required: direction
    if (typeof transition.direction !== 'string' || transition.direction.trim() === '') {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: fieldPath + '.direction',
            message: `${file} transition at ${fieldPath} is missing required field "direction".`
        })
    } else if (!VALID_DIRECTIONS.has(transition.direction)) {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: fieldPath + '.direction',
            value: transition.direction,
            message: `${file} transition at ${fieldPath} has unrecognised direction ${JSON.stringify(transition.direction)}.`
        })
    }

    if (isGuid(transition.direction)) {
        validateSemanticAtlasReference(issues, file, fieldPath + '.direction', transition.direction)
    }

    // Required: threshold
    if (typeof transition.threshold !== 'string' || transition.threshold.trim() === '') {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: fieldPath + '.threshold',
            message: `${file} transition at ${fieldPath} is missing required field "threshold".`
        })
    }

    // Required: destinationAreaRef
    if (typeof transition.destinationAreaRef !== 'string' || transition.destinationAreaRef.trim() === '') {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: fieldPath + '.destinationAreaRef',
            message: `${file} transition at ${fieldPath} is missing required field "destinationAreaRef".`
        })
    } else {
        validateSemanticAtlasReference(issues, file, fieldPath + '.destinationAreaRef', transition.destinationAreaRef)
        if (!allAtlasNodeIds.has(transition.destinationAreaRef)) {
            pushIssue(issues, {
                type: 'atlas-transition-reference-integrity',
                file,
                fieldPath: fieldPath + '.destinationAreaRef',
                value: transition.destinationAreaRef,
                message: `${file} transition at ${fieldPath}.destinationAreaRef references unknown destination area ${JSON.stringify(transition.destinationAreaRef)}. Must match a node in any known atlas.`
            })
        }
    }

    // Required: destinationReadiness
    if (typeof transition.destinationReadiness !== 'string' || transition.destinationReadiness.trim() === '') {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: fieldPath + '.destinationReadiness',
            message: `${file} transition at ${fieldPath} is missing required field "destinationReadiness".`
        })
    } else if (!VALID_READINESS_STATES.has(transition.destinationReadiness)) {
        pushIssue(issues, {
            type: 'atlas-transition-invalid',
            file,
            fieldPath: fieldPath + '.destinationReadiness',
            value: transition.destinationReadiness,
            message: `${file} transition at ${fieldPath} has invalid destinationReadiness ${JSON.stringify(transition.destinationReadiness)}. Must be one of: ready, partial, blocked, deferred.`
        })
    }

    // Optional: entrySegmentRef must be a semantic key, not a GUID
    if (transition.entrySegmentRef !== undefined) {
        validateSemanticAtlasReference(issues, file, fieldPath + '.entrySegmentRef', transition.entrySegmentRef)
        if (typeof transition.entrySegmentRef === 'string' && !allAtlasNodeIds.has(transition.entrySegmentRef)) {
            pushIssue(issues, {
                type: 'atlas-transition-reference-integrity',
                file,
                fieldPath: fieldPath + '.entrySegmentRef',
                value: transition.entrySegmentRef,
                message: `${file} transition at ${fieldPath}.entrySegmentRef references unknown entrySegmentRef ${JSON.stringify(transition.entrySegmentRef)}. Must match a node in any known atlas.`
            })
        }
    }

    // Optional: handoffRouteRef must be a semantic key, not a GUID
    if (transition.handoffRouteRef !== undefined) {
        validateSemanticAtlasReference(issues, file, fieldPath + '.handoffRouteRef', transition.handoffRouteRef)
    }

    // Contradiction: requiresRouteHandoff=true requires handoffRouteRef
    if (transition.requiresRouteHandoff === true && !transition.handoffRouteRef) {
        pushIssue(issues, {
            type: 'atlas-transition-contradiction',
            file,
            fieldPath,
            message: `${file} transition at ${fieldPath} has requiresRouteHandoff=true but no handoffRouteRef is provided.`
        })
    }

    // Contradiction: traversal=blocked but destinationReadiness=ready
    if (traversal === 'blocked' && transition.destinationReadiness === 'ready') {
        pushIssue(issues, {
            type: 'atlas-transition-contradiction',
            file,
            fieldPath,
            message: `${file} transition at ${fieldPath} has traversal "blocked" but destinationReadiness "ready" — a blocked traversal edge should not indicate a ready destination.`
        })
    }
}

function collectAtlasIssues(issues) {
    const longReachAtlas = readOptionalJson(DATA_FILES.longReachAtlas)
    const mosswellAtlas = readOptionalJson(DATA_FILES.mosswellAtlas)

    const longReachNodeIds = new Set((longReachAtlas?.macroGraph?.nodes || []).map((node) => node?.id).filter((id) => typeof id === 'string'))

    // Combined node IDs across all known atlases — used for cross-file transition reference checks.
    const mosswellNodeIds = new Set((mosswellAtlas?.macroGraph?.nodes || []).map((node) => node?.id).filter((id) => typeof id === 'string'))
    const allAtlasNodeIds = new Set([...longReachNodeIds, ...mosswellNodeIds])

    for (const [file, atlas] of [
        [DATA_FILES.longReachAtlas, longReachAtlas],
        [DATA_FILES.mosswellAtlas, mosswellAtlas]
    ]) {
        if (!atlas || typeof atlas !== 'object') continue

        const nodes = Array.isArray(atlas?.macroGraph?.nodes) ? atlas.macroGraph.nodes : []
        const edges = Array.isArray(atlas?.macroGraph?.edges) ? atlas.macroGraph.edges : []
        const routes = Array.isArray(atlas?.macroGraph?.continuityRoutes) ? atlas.macroGraph.continuityRoutes : []
        const trendProfiles = Array.isArray(atlas?.macroGraph?.directionalTrendProfiles) ? atlas.macroGraph.directionalTrendProfiles : []

        if (nodes.length >= ATLAS_NODE_COUNT_WARN_THRESHOLD) {
            pushIssue(issues, {
                type: 'atlas-node-count-threshold',
                file,
                count: nodes.length,
                threshold: ATLAS_NODE_COUNT_WARN_THRESHOLD,
                message: `${file} has ${nodes.length} macro nodes (>= ${ATLAS_NODE_COUNT_WARN_THRESHOLD}). ADR-010 revisit trigger T4 has fired — evaluate Gremlin macro vertex promotion per issue #984.`
            })
        }

        const nodeIds = new Set(nodes.map((node) => node?.id).filter((id) => typeof id === 'string'))
        const barrierIds = new Set(
            nodes.filter((node) => node?.nodeClass === 'barrier').map((node) => node?.id).filter((id) => typeof id === 'string')
        )

        nodes.forEach((node, index) => {
            validateSemanticAtlasReference(issues, file, `macroGraph.nodes[${index}].id`, node?.id)
        })

        routes.forEach((route, index) => {
            validateSemanticAtlasReference(issues, file, `macroGraph.continuityRoutes[${index}].id`, route?.id)
        })

        edges.forEach((edge, index) => {
            const edgeFieldPath = `macroGraph.edges[${index}]`
            const isMacroTransition = edge?.relation === 'macro-transition'

            validateSemanticAtlasReference(issues, file, `${edgeFieldPath}.from`, edge?.from)
            validateSemanticAtlasReference(issues, file, `${edgeFieldPath}.to`, edge?.to)

            // For macro-transition edges, `from` must be a within-file node but `to` may reference
            // a node in another atlas file. Validate each accordingly.
            validateReferenceMembership(issues, file, `${edgeFieldPath}.from`, edge?.from, nodeIds, 'atlas node')
            if (isMacroTransition) {
                validateReferenceMembership(issues, file, `${edgeFieldPath}.to`, edge?.to, allAtlasNodeIds, 'atlas node (any atlas)')
            } else {
                validateReferenceMembership(issues, file, `${edgeFieldPath}.to`, edge?.to, nodeIds, 'atlas node')
            }

            for (const [barrierIndex, barrierRef] of (edge?.barrierRefs || []).entries()) {
                validateSemanticAtlasReference(issues, file, `${edgeFieldPath}.barrierRefs[${barrierIndex}]`, barrierRef)
                validateReferenceMembership(
                    issues,
                    file,
                    `${edgeFieldPath}.barrierRefs[${barrierIndex}]`,
                    barrierRef,
                    barrierIds,
                    'atlas barrier'
                )
            }

            if (isMacroTransition) {
                validateTransitionMetadata(issues, file, edgeFieldPath, edge?.transition, edge?.traversal, allAtlasNodeIds)
            }
        })

        trendProfiles.forEach((profile, index) => {
            validateSemanticAtlasReference(issues, file, `macroGraph.directionalTrendProfiles[${index}].anchorNode`, profile?.anchorNode)
            validateReferenceMembership(
                issues,
                file,
                `macroGraph.directionalTrendProfiles[${index}].anchorNode`,
                profile?.anchorNode,
                nodeIds,
                'atlas node'
            )
        })
    }

    if (typeof mosswellAtlas?.settlement?.placement?.macroAreaRef === 'string') {
        validateSemanticAtlasReference(
            issues,
            DATA_FILES.mosswellAtlas,
            'settlement.placement.macroAreaRef',
            mosswellAtlas.settlement.placement.macroAreaRef
        )
        validateReferenceMembership(
            issues,
            DATA_FILES.mosswellAtlas,
            'settlement.placement.macroAreaRef',
            mosswellAtlas.settlement.placement.macroAreaRef,
            longReachNodeIds,
            'Long Reach atlas node'
        )
    }

    if (typeof longReachAtlas?.mosswellPlacement?.macroAreaRef === 'string') {
        validateSemanticAtlasReference(
            issues,
            DATA_FILES.longReachAtlas,
            'mosswellPlacement.macroAreaRef',
            longReachAtlas.mosswellPlacement.macroAreaRef
        )
        validateReferenceMembership(
            issues,
            DATA_FILES.longReachAtlas,
            'mosswellPlacement.macroAreaRef',
            longReachAtlas.mosswellPlacement.macroAreaRef,
            longReachNodeIds,
            'Long Reach atlas node'
        )
    }

    if (Array.isArray(longReachAtlas?.mosswellPlacement?.adjacentMacroRefs)) {
        longReachAtlas.mosswellPlacement.adjacentMacroRefs.forEach((ref, index) => {
            validateSemanticAtlasReference(issues, DATA_FILES.longReachAtlas, `mosswellPlacement.adjacentMacroRefs[${index}]`, ref)
            validateReferenceMembership(
                issues,
                DATA_FILES.longReachAtlas,
                `mosswellPlacement.adjacentMacroRefs[${index}]`,
                ref,
                longReachNodeIds,
                'Long Reach atlas node'
            )
        })
    }
}

function collectIssues() {
    const issues = []

    for (const packagePath of CONSUMER_PACKAGES) {
        const pkg = readJson(packagePath)
        const dependencyValue = pkg.dependencies?.[SHARED_PACKAGE_NAME]

        if (typeof dependencyValue === 'string' && dependencyValue.startsWith('file:')) {
            issues.push({
                type: 'shared-file-reference',
                file: packagePath,
                packageName: pkg.name,
                dependency: SHARED_PACKAGE_NAME,
                value: dependencyValue,
                message: `${packagePath} uses forbidden local file reference for ${SHARED_PACKAGE_NAME}: ${dependencyValue}`
            })
        }
    }

    collectSeedIdIssues(issues)
    collectAtlasIssues(issues)

    return issues
}

function main() {
    const args = new Set(process.argv.slice(2))
    const jsonMode = args.has('--json') || process.env.VERIFY_RUNTIME_INVARIANTS_JSON === '1'
    const strictMode = args.has('--strict') || process.env.VERIFY_RUNTIME_INVARIANTS_STRICT === '1'

    const issues = collectIssues()
    const result = {
        status: strictMode && issues.length > 0 ? 'fail' : 'warn',
        mode: strictMode ? 'strict' : 'warn',
        counts: Object.fromEntries(ISSUE_TYPES.map((type) => [type, issues.filter((issue) => issue.type === type).length])),
        issues,
        timestamp: new Date().toISOString()
    }

    if (jsonMode) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        process.exit(strictMode && issues.length > 0 ? 1 : 0)
    }

    process.stdout.write(`[verify-runtime-invariants] found ${issues.length} runtime invariant issue(s).\n`)
    for (const issue of issues) {
        process.stderr.write(`[verify-runtime-invariants] WARN ${issue.message}\n`)
    }

    if (strictMode && issues.length > 0) {
        process.stderr.write('[verify-runtime-invariants] FAIL (strict mode) — invariant issues detected.\n')
        process.exit(1)
    }

    process.stdout.write(`[verify-runtime-invariants] ${strictMode ? 'STRICT' : 'WARN-ONLY'} mode complete.\n`)
    process.exit(0)
}

main()