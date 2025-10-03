#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
// Deprecated: analyze-issue-priority.mjs relied on local implementation-order.json which has been removed.
// Priority / ordering decisions now derive directly from the Project field 'Implementation order'.
console.error('[deprecated] analyze-issue-priority.mjs has been retired (no local ordering file).')
process.exit(0)
/*
        weight: 180,
        description: 'World foundation and player identity systems'
    },

    // Infrastructure and DevX
    INFRASTRUCTURE: {
        keywords: ['telemetry', 'observability', 'test', 'integration', 'ci', 'deployment'],
        weight: 90,
        description: 'Infrastructure and developer experience'
    }
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
        if (err.code === 'ENOENT') {
            return { project: 3, fieldId: '', generated: new Date().toISOString(), items: [] }
        }
        throw err
    }
}

function analyzeRoadmapPathDependencies(issue) {
    const content = `${issue.title} ${issue.description}`.toLowerCase()
    let pathScore = 0
    let pathFactors = []
    let bestMatch = null
    let bestMatchScore = 0

    // Check for roadmap path alignment - find the best match
    for (const [pathKey, pathInfo] of Object.entries(ROADMAP_PATH_DEPENDENCIES)) {
        let matchCount = 0
        for (const keyword of pathInfo.keywords) {
            if (content.includes(keyword)) {
                matchCount++
            }
        }

        // Calculate match score as percentage of keywords matched
        const matchScore = matchCount / pathInfo.keywords.length
        if (matchScore > bestMatchScore && matchCount > 0) {
            bestMatchScore = matchScore
            bestMatch = pathInfo
        }
    }

    // Apply the best matching path's weight
    if (bestMatch) {
        pathScore = bestMatch.weight * bestMatchScore // Scale by match quality
        pathFactors.push(`Roadmap path (${bestMatch.description}): +${Math.round(pathScore)}`)
    }

    // If no specific path matched, check if it aligns with any known foundational work
    if (pathScore === 0) {
        const foundationalKeywords = ['foundation', 'bootstrap', 'core', 'basic', 'essential', 'prerequisite']
        for (const keyword of foundationalKeywords) {
            if (content.includes(keyword)) {
                pathScore += 50 // Generic foundational work bonus
                pathFactors.push(`Foundational work detected: +50`)
                break
            }
        }
    }

    return { pathScore: Math.round(pathScore), pathFactors }
}

function calculatePriorityScore(issue, existingOrdering) {
    let score = 0
    let factors = []

    // Parse labels for scope and type
    const labels = issue.labels.split(',').filter((l) => l.trim())
    let scope = null
    let type = null

    for (const label of labels) {
        const l = label.toLowerCase().trim()

        // Scope labels
        if (l.startsWith('scope:')) {
            scope = l.replace('scope:', '').toUpperCase()
            const weight = WEIGHTS[`SCOPE_${scope}`] || 0
            score += weight
            factors.push(`Scope ${scope}: +${weight}`)
        }

        // Type labels
        if (['feature', 'enhancement', 'refactor', 'infra', 'docs', 'spike', 'test'].includes(l)) {
            type = l.toUpperCase()
            const weight = WEIGHTS[`TYPE_${type}`] || 0
            score += weight
            factors.push(`Type ${type}: +${weight}`)
        }
    }

    // Milestone priority
    if (issue.milestone) {
        const milestone = issue.milestone.toUpperCase()
        if (milestone.match(/M[0-5]/)) {
            const weight = WEIGHTS[`MILESTONE_${milestone}`] || 0
            score += weight
            factors.push(`Milestone ${milestone}: +${weight}`)
        }
    }

    // Roadmap path dependencies analysis (NEW - main enhancement)
    const { pathScore, pathFactors } = analyzeRoadmapPathDependencies(issue)
    score += pathScore
    factors.push(...pathFactors)

    // Content analysis for priority keywords
    const content = `${issue.title} ${issue.description}`.toLowerCase()

    for (const keyword of PRIORITY_KEYWORDS.HIGH) {
        if (content.includes(keyword)) {
            score += 30
            factors.push(`High priority keyword "${keyword}": +30`)
            break // Only add bonus once per category
        }
    }

    for (const keyword of PRIORITY_KEYWORDS.MEDIUM) {
        if (content.includes(keyword)) {
            score += 15
            factors.push(`Medium priority keyword "${keyword}": +15`)
            break
        }
    }

    for (const keyword of PRIORITY_KEYWORDS.LOW) {
        if (content.includes(keyword)) {
            score -= 10
            factors.push(`Low priority keyword "${keyword}": -10`)
            break
        }
    }

    // Dependency analysis (simple heuristics)
    const dependencyPatterns = [/depends\s+on\s+#(\d+)/gi, /blocked\s+by\s+#(\d+)/gi, /blocks\s+#(\d+)/gi, /prerequisite.*#(\d+)/gi]

    const blockingPatterns = [/blocks\s+#(\d+)/gi, /prerequisite\s+for/gi, /foundation\s+for/gi, /required\s+for/gi]

    for (const pattern of dependencyPatterns) {
        if (pattern.test(content)) {
            if (blockingPatterns.some((bp) => bp.test(content))) {
                score += WEIGHTS.DEPENDENCY_BLOCKER
                factors.push(`Blocks other issues: +${WEIGHTS.DEPENDENCY_BLOCKER}`)
            } else {
                score += WEIGHTS.DEPENDENCY_BLOCKED
                factors.push(`Blocked by other issues: +${WEIGHTS.DEPENDENCY_BLOCKED}`)
            }
            break
        }
    }

    return { score, factors }
}

function determineInsertionPoint(priorityScore, existingOrdering) {
    // If no existing items, insert at position 1
    if (existingOrdering.items.length === 0) {
        return { position: 1, requiresResequence: false, confidence: 'high' }
    }

    // For very high scores, insert near the beginning
    if (priorityScore >= 200) {
        return { position: 1, requiresResequence: true, confidence: 'high' }
    }

    // For high scores, insert in first third
    if (priorityScore >= 150) {
        const position = Math.max(1, Math.floor(existingOrdering.items.length * 0.33))
        return { position, requiresResequence: true, confidence: 'high' }
    }

    // For medium scores, insert in middle third
    if (priorityScore >= 100) {
        const position = Math.floor(existingOrdering.items.length * 0.5)
        return { position, requiresResequence: position < existingOrdering.items.length, confidence: 'medium' }
    }

    // For lower scores, insert in last third or at end
    if (priorityScore >= 50) {
        const position = Math.floor(existingOrdering.items.length * 0.75)
        return { position, requiresResequence: position < existingOrdering.items.length, confidence: 'medium' }
    }

    // Low priority - append at end
    return {
        position: existingOrdering.items.length + 1,
        requiresResequence: false,
        confidence: 'low'
    }
}

function generateRationale(issue, analysis, insertion, hasExistingOrder) {
    let rationale = []

    if (hasExistingOrder) {
        rationale.push(`Issue #${issue.number} already has implementation order ${issue.existingOrder}.`)
        if (analysis.action === 'skip') {
            rationale.push('No changes needed based on current analysis.')
            return rationale.join(' ')
        }
        rationale.push(`Recommending update to position ${insertion.position}.`)
    } else {
        rationale.push(`Issue #${issue.number} does not have an implementation order assigned.`)
        rationale.push(`Recommending insertion at position ${insertion.position}.`)
    }

    rationale.push(`\n**Priority Score:** ${analysis.score}`)

    // Check if roadmap path factors contributed significantly
    const pathFactors = analysis.factors.filter((f) => f.includes('Roadmap path'))
    if (pathFactors.length > 0) {
        rationale.push(
            `\n**Roadmap Path Analysis:** This issue aligns with documented implementation phases in docs/modules, influencing its priority.`
        )
    }

    if (analysis.factors.length > 0) {
        rationale.push(`\n**Factors contributing to priority:**`)
        for (const factor of analysis.factors.slice(0, 7)) {
            // Increased limit to show path factors
            rationale.push(`- ${factor}`)
        }
    }

    if (insertion.requiresResequence) {
        rationale.push(`\n**Impact:** Inserting at this position will require resequencing existing issues.`)
    } else {
        rationale.push(`\n**Impact:** Can be added without affecting existing issue order.`)
    }

    return rationale.join('\n')
}

async function main() {
    const { values } = parseArgs({
        options: {
            'issue-number': { type: 'string', short: 'n' },
            title: { type: 'string', short: 't' },
            'description-file': { type: 'string', short: 'd' },
            labels: { type: 'string', short: 'l' },
            milestone: { type: 'string', short: 'm' },
            'has-existing-order': { type: 'string' },
            'existing-order': { type: 'string' },
            'force-resequence': { type: 'string' }
        }
    })

    const issue = {
        number: parseInt(values['issue-number'], 10),
        title: values.title || '',
        description: values['description-file'] ? fs.readFileSync(values['description-file'], 'utf8').trim() : '',
        labels: values.labels || '',
        milestone: values.milestone || '',
        hasExistingOrder: values['has-existing-order'] === 'true',
        existingOrder: parseInt(values['existing-order'], 10) || 0
    }

    const forceResequence = values['force-resequence'] === 'true'

    // Load existing implementation order
    const existingOrdering = readJson(ROADMAP_JSON)

    // Calculate priority score
    const { score, factors } = calculatePriorityScore(issue, existingOrdering)

    // Determine where to insert the issue
    const insertion = determineInsertionPoint(score, existingOrdering)

    // Determine action to take
    let action = 'assign'

    if (issue.hasExistingOrder && !forceResequence) {
        // Check if current position is reasonable
        const currentPosition = issue.existingOrder
        const recommendedPosition = insertion.position

        // If within reasonable range (±2 positions), skip
        if (Math.abs(currentPosition - recommendedPosition) <= 2) {
            action = 'skip'
        } else {
            action = 'update'
        }
    }

    const result = {
        issueNumber: issue.number,
        priorityScore: score,
        recommendedOrder: insertion.position,
        requiresResequence: insertion.requiresResequence,
        confidence: insertion.confidence,
        action: action,
        rationale: generateRationale(issue, { score, factors }, insertion, issue.hasExistingOrder),
        factors: factors,
        analysis: {
            existingPosition: issue.hasExistingOrder ? issue.existingOrder : null,
            recommendedPosition: insertion.position,
            totalIssues: existingOrdering.items.length,
            forceResequence: forceResequence
        }
    }

    console.log(JSON.stringify(result, null, 2))
}

main && main().catch((err) => {
    console.error('Error analyzing issue (deprecated path):', err)
    process.exit(1)
})
*/
