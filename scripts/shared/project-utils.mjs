#!/usr/bin/env node
/* eslint-env node */
/* global process */
/**
 * Shared lightweight project utility helpers extracted from multiple automation scripts
 * (schedule-roadmap, post-provisional-schedule, calculate-variance, update-issue-status).
 *
 * Goal: remove duplicated inline helpers (field extraction, label classification, date math)
 * without altering existing runtime behaviour. Keep implementation intentionally minimal
 * and dependency‑free so scripts can import a stable surface.
 *
 * NOTE: Do NOT add GitHub network logic here yet (GraphQL pagination / suppression variants differ
 * across scripts and have contextual nuances). This module purposely limits scope to pure helpers.
 */

/**
 * Extract a field value (date | name | number) from a ProjectV2 item node.
 * Mirrors the most permissive existing implementation (first matching field wins).
 *
 * @param {object} node Project item node ({ fieldValues: { nodes: [...] } })
 * @param {string} fieldName Field name to resolve (case sensitive)
 * @returns {string|number|null}
 */
export function extractFieldValue(node, fieldName) {
    if (!node || !node.fieldValues || !Array.isArray(node.fieldValues.nodes)) return null
    for (const fv of node.fieldValues.nodes) {
        if (fv?.field?.name === fieldName) {
            return fv.date || fv.name || fv.number || fv.text || null
        }
    }
    return null
}

/**
 * Extract the textual Status value from fieldValues (normalised existing logic).
 * @param {object} fieldValues fieldValues object with nodes
 * @returns {string} status or empty string
 */
export function extractStatus(fieldValues) {
    if (!fieldValues || !Array.isArray(fieldValues.nodes)) return ''
    for (const fv of fieldValues.nodes) {
        if (fv?.field?.name === 'Status') {
            return fv.name || fv.text || fv.number || ''
        }
    }
    return ''
}

/**
 * Classify an issue by its first scope label (scope:*) and first non‑scope label (type-ish).
 * @param {object} issue Issue object with labels{nodes:[{name}]}
 * @returns {{scope:string,type:string}}
 */
export function classifyIssue(issue) {
    const labels = issue?.labels?.nodes?.map((l) => l.name) || issue?.labels?.map?.((l) => l.name) || []
    const scope = labels.find((l) => l.startsWith('scope:')) || ''
    const type = labels.find((l) => !l.startsWith('scope:')) || ''
    return { scope, type }
}

/**
 * Normalise input into a UTC midnight Date instance.
 * Accepts Date (uses its UTC Y/M/D) or ISO date (YYYY-MM-DD).
 * @private
 */
function toUtcDay(d) {
    if (d instanceof Date) {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    }
    // Assume string (YYYY-MM-DD). Fallback: pass through Date parser.
    return new Date(d.includes('T') ? d : d + 'T00:00:00Z')
}

/**
 * Inclusive whole‑day difference between two dates (>=1).
 * Accepts Date or ISO date strings.
 * @param {string|Date} start
 * @param {string|Date} end
 * @returns {number}
 */
export function wholeDayDiff(start, end) {
    const s = toUtcDay(start)
    const e = toUtcDay(end)
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)))
}

/**
 * Signed day delta (a - b). Accepts Date or ISO date strings.
 * @param {string|Date} a
 * @param {string|Date} b
 * @returns {number}
 */
export function dateDiff(a, b) {
    const d1 = toUtcDay(a)
    const d2 = toUtcDay(b)
    return Math.round((d1 - d2) / (1000 * 60 * 60 * 24))
}

/**
 * Add N days (mutability‑safe) returning new ISO date (YYYY-MM-DD).
 * @param {string|Date} date
 * @param {number} days
 * @returns {string}
 */
export function addDaysIso(date, days) {
    const d = toUtcDay(date)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/**
 * Utility guard to assert value is an ISO date pattern (lightweight).
 * @param {string} v
 * @returns {boolean}
 */
export function isIsoDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

// Contract (light): pure helpers only. No side effects beyond simple computation.
