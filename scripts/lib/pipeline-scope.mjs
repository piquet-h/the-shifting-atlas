#!/usr/bin/env node
/* eslint-env node */

const FORMATTER_EXT_PATTERN = /\.(cjs|css|cts|html|js|jsx|json|md|mjs|mts|ts|tsx|yml|yaml)$/i

function normalizePath(filePath) {
    return String(filePath ?? '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
}

function globToRegExp(pattern) {
    const normalized = normalizePath(pattern)
    if (normalized === '**/*' || normalized === '**') {
        return /^.+$/
    }

    let regex = '^'
    for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i]
        if (ch === '*') {
            if (normalized[i + 1] === '*') {
                if (normalized[i + 2] === '/') {
                    regex += '(?:.*/)?'
                    i += 2
                } else {
                    regex += '.*'
                    i += 1
                }
            } else {
                regex += '[^/]*'
            }
        } else if (ch === '?') {
            regex += '[^/]'
        } else if ('.+^$()|[]\\{}'.includes(ch)) {
            regex += `\\${ch}`
        } else {
            regex += ch
        }
    }
    regex += '$'
    return new RegExp(regex)
}

export function matchGlob(filePath, pattern) {
    return globToRegExp(pattern).test(normalizePath(filePath))
}

function matchesRuleSet(filePath, ruleSet = {}) {
    const includes = Array.isArray(ruleSet.include) ? ruleSet.include : []
    const excludes = Array.isArray(ruleSet.exclude) ? ruleSet.exclude : []
    const included = includes.some((glob) => matchGlob(filePath, glob))
    if (!included) return false
    return !excludes.some((glob) => matchGlob(filePath, glob))
}

export function buildMatrixLegs(lanes) {
    const legs = []
    for (const lane of lanes) {
        if (lane === 'backend') {
            legs.push(
                {
                    id: 'backend-unit',
                    lane: 'backend-unit',
                    label: 'Backend (lint, typecheck, unit & static invariants)'
                },
                {
                    id: 'backend-integration',
                    lane: 'backend-integration',
                    label: 'Backend (integration, runtime behavior & packager)'
                }
            )
        } else if (lane === 'shared') {
            legs.push({
                id: 'shared',
                lane: 'shared',
                label: 'Shared (lint, typecheck, unit tests & prompts)'
            })
        } else if (lane === 'frontend') {
            legs.push({
                id: 'frontend',
                lane: 'frontend',
                label: 'Frontend (lint, typecheck, build & vitest)'
            })
        } else if (lane === 'a11y') {
            legs.push({
                id: 'a11y',
                lane: 'a11y',
                label: 'Accessibility (axe-core)'
            })
        } else if (lane === 'infrastructure') {
            legs.push({
                id: 'infrastructure',
                lane: 'infrastructure',
                label: 'Infrastructure (offline Bicep & workbooks)'
            })
        } else if (lane === 'governance') {
            legs.push({
                id: 'governance',
                lane: 'governance',
                label: 'Governance (Prettier, secrets, TODOs, docs & instructions)'
            })
        } else {
            legs.push({ id: lane, lane, label: lane })
        }
    }
    return legs
}

export function resolveValidationScope(changedFiles, manifest) {
    const normalizedFiles = [...new Set((changedFiles ?? []).map(normalizePath).filter(Boolean))].sort()
    const lanes = []

    for (const [laneName, ruleSet] of Object.entries(manifest?.validationLanes ?? {})) {
        if (normalizedFiles.some((file) => matchesRuleSet(file, ruleSet))) {
            lanes.push(laneName)
        }
    }

    lanes.sort()

    const bicepFiles = normalizedFiles.filter((file) => file.startsWith('infrastructure/') && file.endsWith('.bicep'))
    const formatterFiles = normalizedFiles.filter((file) => FORMATTER_EXT_PATTERN.test(file))

    return {
        changedFiles: normalizedFiles,
        lanes,
        matrixLegs: buildMatrixLegs(lanes),
        bicepFiles,
        formatterFiles
    }
}

export function resolveDeployUnitAffected({ unit, changedFiles, manifest }) {
    const ruleSet = manifest?.deployUnits?.[unit]
    if (!ruleSet) {
        throw new Error(`Unknown deploy unit "${unit}" in pipeline ownership manifest.`)
    }
    const normalizedFiles = [...new Set((changedFiles ?? []).map(normalizePath).filter(Boolean))].sort()
    const matchingFiles = normalizedFiles.filter((file) => matchesRuleSet(file, ruleSet))
    return {
        unit,
        affected: matchingFiles.length > 0,
        matchingFiles
    }
}
