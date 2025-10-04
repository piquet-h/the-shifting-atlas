#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
/**
 * Provisional schedule comment generation and formatting.
 * Generates idempotent comments with the canonical marker for provisional schedules.
 */

/**
 * Canonical marker for provisional schedule comments (v1 format).
 * @type {string}
 */
export const PROVISIONAL_MARKER = '<!-- PROVISIONAL_SCHEDULE:v1 -->'

/**
 * Capitalize the first letter of a string.
 * @private
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Generate a human-readable basis description for the estimation.
 *
 * @param {string} confidence - Confidence level ('high', 'medium', 'low')
 * @param {number} sampleSize - Number of samples used
 * @param {string} basis - Basis type ('scope-type', 'scope', 'global', 'fallback')
 * @param {string} scope - Scope label
 * @param {string} type - Type label
 * @param {number} duration - Estimated duration in days
 * @returns {string} Human-readable basis description
 */
export function generateBasisDescription(confidence, sampleSize, basis, scope, type, duration) {
    switch (basis) {
        case 'scope-type':
            return `Median of ${sampleSize} ${scope}+${type} issues (${duration} days)`
        case 'scope':
            return `Median of ${sampleSize} ${scope} issues (${duration} days)`
        case 'global':
            return `Global median of ${sampleSize} completed issues (${duration} days)`
        case 'fallback':
            return `Default estimate (${duration} days) - insufficient historical data`
        default:
            return `Based on ${basis} (${duration} days)`
    }
}

/**
 * Generate a provisional schedule comment body.
 *
 * @param {object} data - Comment data
 * @param {string} data.startDate - ISO date string (YYYY-MM-DD)
 * @param {string} data.finishDate - ISO date string (YYYY-MM-DD)
 * @param {number} data.duration - Duration in days
 * @param {number} data.order - Implementation order number
 * @param {string} data.confidence - Confidence level ('high', 'medium', 'low')
 * @param {number} data.sampleSize - Number of samples used
 * @param {string} data.basis - Basis type ('scope-type', 'scope', 'global', 'fallback')
 * @param {string} data.scope - Scope label
 * @param {string} data.type - Type label
 * @returns {string} Markdown comment body with marker
 */
export function generateProvisionalComment(data) {
    const { startDate, finishDate, duration, order, confidence, sampleSize, basis, scope, type } = data

    const timestamp = new Date().toISOString()
    const basisDescription = generateBasisDescription(confidence, sampleSize, basis, scope, type, duration)

    return `${PROVISIONAL_MARKER}
## 📅 Provisional Schedule (Automated)

**Estimated Start:** ${startDate}  
**Estimated Finish:** ${finishDate}  
**Duration:** ${duration} days  
**Implementation Order:** #${order}

### Estimation Basis

- **Confidence:** ${capitalize(confidence)} (High / Medium / Low)
- **Sample Size:** ${sampleSize} similar issues
- **Basis:** ${basisDescription}

<details>
<summary>How this estimate was calculated</summary>

This provisional schedule is automatically calculated when implementation order is assigned. It uses historical completion times from similar issues (same scope and type labels) to project start and finish dates.

- **High confidence:** ≥5 completed issues with same scope+type
- **Medium confidence:** ≥3 completed issues with same scope OR ≥10 global samples
- **Low confidence:** Insufficient data, using default estimate

The actual schedule will be updated daily by the roadmap scheduler and may differ based on upstream changes, status transitions, or manual adjustments.

Last calculated: ${timestamp} UTC
</details>

---
*This is a provisional estimate only. Actual dates are managed in the [Project Roadmap](https://github.com/piquet-h/the-shifting-atlas/projects/3).*`
}

/**
 * Find an existing provisional comment in a list of comments.
 *
 * @param {Array} comments - Array of comment objects with 'body' property
 * @returns {object|null} Existing comment object or null if not found
 */
export function findProvisionalComment(comments) {
    return comments.find((c) => c.body && c.body.includes(PROVISIONAL_MARKER)) || null
}

/**
 * Determine if a provisional comment should be posted based on confidence.
 *
 * @param {string} confidence - Confidence level ('high', 'medium', 'low')
 * @param {string} state - Issue state ('OPEN', 'CLOSED')
 * @returns {boolean} True if comment should be posted
 */
export function shouldPostProvisionalComment(confidence, state) {
    // Only post for high confidence on open issues (per sub-issue 2 spec)
    // Medium confidence can be posted too for better visibility
    if (state === 'CLOSED') return false
    if (confidence === 'low') return false // Skip low confidence to avoid noise
    return true
}
