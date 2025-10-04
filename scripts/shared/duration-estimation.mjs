#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
/**
 * Duration estimation module for provisional schedule calculation.
 * Extracted from schedule-roadmap.mjs for reuse in ordering assignment.
 *
 * This module provides historical duration analysis and confidence-based estimation
 * using completed issues grouped by scope and type labels.
 */

/**
 * Default duration when insufficient historical data exists.
 * @type {number}
 */
export const DEFAULT_DURATION_DAYS = 2

/**
 * Minimum sample sizes for different confidence levels:
 * - 5 samples for exact scope|type match (high confidence)
 * - 3 samples for scope-only match (medium confidence)
 * - 10 samples for global median (medium confidence)
 * @type {object}
 */
export const MIN_SAMPLE_SIZE = {
    EXACT_KEY: 5, // scope|type exact match
    SCOPE_ONLY: 3, // scope-only match
    GLOBAL: 10 // global median
}

/**
 * Calculate the median of an array of numbers.
 * @private
 * @param {number[]} nums - Array of numbers
 * @returns {number} Median value, or 0 if array is empty
 */
function median(nums) {
    if (!nums.length) return 0
    const s = [...nums].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Calculate whole day difference between two dates (inclusive).
 * @private
 * @param {Date} a - Start date
 * @param {Date} b - End date
 * @returns {number} Number of days (minimum 1)
 */
function wholeDayDiff(a, b) {
    return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

/**
 * Extract a field value from a project item node.
 * @private
 * @param {object} node - Project item node with fieldValues
 * @param {string} fieldName - Name of the field to extract
 * @returns {string|null} Field value or null if not found
 */
function extractFieldValue(node, fieldName) {
    for (const fv of node.fieldValues.nodes) {
        if (fv.field?.name === fieldName) {
            return fv.date || fv.name || null
        }
    }
    return null
}

/**
 * Classify an issue by extracting scope and type labels.
 * @private
 * @param {object} issue - Issue object with labels
 * @returns {{scope: string, type: string}} Scope and type labels
 */
function classifyIssue(issue) {
    const labels = issue.labels?.nodes?.map((l) => l.name) || []
    const scope = labels.find((l) => l.startsWith('scope:')) || ''
    const type = labels.find((l) => !l.startsWith('scope:')) || ''
    return { scope, type }
}

/**
 * Build historical duration samples from closed project items.
 * Extracts durations from Start/Finish fields or createdAt/closedAt timestamps.
 *
 * @param {Array} projectItems - Array of project item objects
 * @param {string} startFieldName - Name of the start date field (e.g., 'Start')
 * @param {string} targetFieldName - Name of the finish date field (e.g., 'Finish')
 * @returns {{byKey: Map<string, number[]>, byScope: Map<string, number[]>, all: number[]}}
 *          Historical durations grouped by scope|type key, scope, and globally
 */
export function buildHistoricalDurations(projectItems, startFieldName, targetFieldName) {
    const samples = []
    for (const item of projectItems) {
        const content = item.content
        if (content.state !== 'CLOSED') continue
        const startStr = extractFieldValue(item, startFieldName)
        const endStr = extractFieldValue(item, targetFieldName)
        let duration = null
        if (startStr && endStr) {
            const s = new Date(startStr + 'T00:00:00Z')
            const e = new Date(endStr + 'T00:00:00Z')
            if (!isNaN(s) && !isNaN(e) && e >= s) duration = wholeDayDiff(s, e) + 0 // inclusive days
        }
        if (duration == null && content.createdAt && content.closedAt) {
            const s = new Date(content.createdAt)
            const e = new Date(content.closedAt)
            if (!isNaN(s) && !isNaN(e) && e >= s) duration = wholeDayDiff(s, e)
        }
        if (duration == null) continue
        const { scope, type } = classifyIssue(content)
        samples.push({ scope, type, duration })
    }
    const byKey = new Map()
    const byScope = new Map()
    const all = []
    // Populate grouped collections
    for (const s of samples) {
        const key = `${s.scope}|${s.type}`
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key).push(s.duration)
        if (!byScope.has(s.scope)) byScope.set(s.scope, [])
        byScope.get(s.scope).push(s.duration)
        all.push(s.duration)
    }
    return { byKey, byScope, all }
}

/**
 * Compute median durations from historical duration samples.
 *
 * @param {{byKey: Map<string, number[]>, byScope: Map<string, number[]>, all: number[]}} historicalDurations
 * @returns {{byKey: Map<string, number>, byScope: Map<string, number>, global: number}}
 *          Median durations for each grouping
 */
export function computeMedians(historicalDurations) {
    return {
        byKey: new Map([...historicalDurations.byKey.entries()].map(([k, v]) => [k, median(v)])),
        byScope: new Map([...historicalDurations.byScope.entries()].map(([k, v]) => [k, median(v)])),
        global: median(historicalDurations.all)
    }
}

/**
 * Choose a duration estimate using fallback hierarchy.
 * Priority: exact scope|type key > scope-only > global > fallback.
 *
 * @param {{byKey: Map<string, number>, byScope: Map<string, number>, global: number}} medians
 * @param {string} scope - Scope label (e.g., 'scope:core')
 * @param {string} type - Type label (e.g., 'feature')
 * @param {number} fallback - Fallback duration if no historical data
 * @returns {number} Chosen duration in days
 */
export function chooseDuration(medians, scope, type, fallback) {
    const key = `${scope}|${type}`
    if (medians.byKey.has(key)) return medians.byKey.get(key)
    if (medians.byScope.has(scope)) return medians.byScope.get(scope)
    if (medians.global) return medians.global
    return fallback
}

/**
 * Estimate duration with confidence level and metadata.
 * This is a convenience function that combines historical analysis with confidence assessment.
 *
 * @param {Array} projectItems - Array of project item objects
 * @param {string} scope - Scope label (e.g., 'scope:core')
 * @param {string} type - Type label (e.g., 'feature')
 * @param {object} [options={}] - Estimation options
 * @param {string} [options.startFieldName='Start'] - Name of start date field
 * @param {string} [options.targetFieldName='Finish'] - Name of finish date field
 * @param {number} [options.fallback=DEFAULT_DURATION_DAYS] - Fallback duration
 * @returns {{duration: number, confidence: string, basis: string, sampleSize: number, metadata: object}}
 *          Duration estimate with confidence and metadata
 */
export function estimateDuration(projectItems, scope, type, options = {}) {
    const { startFieldName = 'Start', targetFieldName = 'Finish', fallback = DEFAULT_DURATION_DAYS } = options

    const hist = buildHistoricalDurations(projectItems, startFieldName, targetFieldName)
    const medians = computeMedians(hist)

    const key = `${scope}|${type}`
    const exactKeySamples = hist.byKey.get(key) || []
    const scopeSamples = hist.byScope.get(scope) || []
    const globalSamples = hist.all

    let duration
    let confidence
    let basis
    let sampleSize

    // Determine confidence and basis using MIN_SAMPLE_SIZE thresholds
    if (exactKeySamples.length >= MIN_SAMPLE_SIZE.EXACT_KEY) {
        duration = medians.byKey.get(key)
        confidence = 'high'
        basis = 'scope-type'
        sampleSize = exactKeySamples.length
    } else if (scopeSamples.length >= MIN_SAMPLE_SIZE.SCOPE_ONLY) {
        duration = medians.byScope.get(scope)
        confidence = 'medium'
        basis = 'scope'
        sampleSize = scopeSamples.length
    } else if (globalSamples.length >= MIN_SAMPLE_SIZE.GLOBAL) {
        duration = medians.global
        confidence = 'medium'
        basis = 'global'
        sampleSize = globalSamples.length
    } else {
        duration = fallback
        confidence = 'low'
        basis = 'fallback'
        sampleSize = 0
    }

    return {
        duration,
        confidence,
        basis,
        sampleSize,
        metadata: {
            scope,
            type,
            medianByKey: medians.byKey.get(key) || null,
            medianByScope: medians.byScope.get(scope) || null,
            globalMedian: medians.global || null,
            exactKeySampleCount: exactKeySamples.length,
            scopeSampleCount: scopeSamples.length,
            globalSampleCount: globalSamples.length
        }
    }
}
