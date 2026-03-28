/**
 * Shared engine for milestone delivery description parsing and rendering.
 *
 * Exported from here and imported by reanalyze-milestone.mjs and any future scripts.
 * Keeps parsing/rendering logic DRY and testable in isolation.
 */

const AUTO_BLOCK_ID = 'milestone-impact-report'
const AUTO_BLOCK_START = `<!-- AUTO-GENERATED: ${AUTO_BLOCK_ID}:start -->`
const AUTO_BLOCK_END = `<!-- AUTO-GENERATED: ${AUTO_BLOCK_ID}:end -->`
const PLACEHOLDER_LINE = '- (add issues, then reorder)'

// ── Issue classification ──────────────────────────────────────────────────────

export function isInfra(issue) {
    const labels = new Set(issue.labels)
    const title = issue.title.toLowerCase()
    return (
        labels.has('infra') ||
        title.startsWith('infra(') ||
        /\bprovision\b/.test(title) ||
        /\brbac\b/.test(title) ||
        /app settings/.test(title)
    )
}

export function isEpic(issue) {
    return new Set(issue.labels).has('epic')
}

export function isSuperseded(issue) {
    if (issue.state !== 'closed') return false

    if (issue.state_reason === 'not_planned') return true

    const title = issue.title.toLowerCase()
    const body = (issue.body ?? '').toLowerCase()

    return (
        title.includes('duplicate') ||
        body.includes('duplicate issue') ||
        body.includes('this issue has been split') ||
        body.includes('see correct split issues')
    )
}

export function isTest(issue) {
    return new Set(issue.labels).has('test')
}

export function isDocs(issue) {
    return new Set(issue.labels).has('docs')
}

// ── Dependency parsing ────────────────────────────────────────────────────────

/**
 * Parse explicit dependency patterns from an issue body.
 * Recognised patterns (case-insensitive):
 *   Blocked by #N  |  Depends on #N  |  Requires #N
 */
export function extractDepsFromBody(issueBody) {
    const deps = new Set()
    if (!issueBody) return deps

    const patterns = [/\bblocked\s+by\s+#(\d+)/gi, /\bdepends\s+on\s+#(\d+)/gi, /\brequires\s+#(\d+)/gi]

    for (const re of patterns) {
        for (const m of issueBody.matchAll(re)) {
            deps.add(Number(m[1]))
        }
    }

    return deps
}

/**
 * Build a dependency graph from issue bodies and sub-issue relationships.
 *
 * @param {Array} issues - Array of issue objects with .number and .body
 * @param {Map<number, Array>} subIssuesByNumber - Map of parent issue number → sub-issue objects
 * @returns {Map<number, Set<number>>} key=issue number, value=Set of issue numbers this issue depends on
 */
export function buildDependencyGraph(issues, subIssuesByNumber) {
    const graph = new Map()

    for (const issue of issues) {
        const deps = extractDepsFromBody(issue.body ?? '')
        graph.set(issue.number, deps)
    }

    // Sub-issues depend on their parent (parent must start before sub-issues are actioned).
    if (subIssuesByNumber) {
        for (const [parentNum, subIssues] of subIssuesByNumber) {
            for (const sub of subIssues ?? []) {
                if (!graph.has(sub.number)) graph.set(sub.number, new Set())
                graph.get(sub.number).add(parentNum)
            }
        }
    }

    return graph
}

/**
 * Topological layer sort.
 *
 * @param {number[]} issueNumbers
 * @param {Map<number, Set<number>>} depGraph
 * @returns {Array<number[]>} Layers; layer[0] has no deps, later layers depend on earlier.
 */
export function topologicalLayers(issueNumbers, depGraph) {
    const nums = [...issueNumbers]
    const inSet = new Set(nums)

    // Filter deps to only those within the provided set.
    const effectiveDeps = new Map()
    for (const n of nums) {
        const rawDeps = depGraph.get(n) ?? new Set()
        effectiveDeps.set(n, new Set([...rawDeps].filter((d) => inSet.has(d))))
    }

    const layers = []
    const placed = new Set()
    const remaining = new Set(nums)

    while (remaining.size > 0) {
        const layer = []
        for (const n of remaining) {
            const unplaced = [...(effectiveDeps.get(n) ?? [])].filter((d) => !placed.has(d))
            if (unplaced.length === 0) layer.push(n)
        }

        if (layer.length === 0) {
            // Cycle detected — dump everything remaining to avoid infinite loop.
            layers.push([...remaining].sort((a, b) => a - b))
            break
        }

        layer.sort((a, b) => a - b)
        layers.push(layer)
        for (const n of layer) {
            placed.add(n)
            remaining.delete(n)
        }
    }

    return layers
}

// ── Description parsing ───────────────────────────────────────────────────────

/**
 * Parse issue numbers listed inside `Order:` blocks.
 *
 * FIXED: Tolerates blank lines between `Order:` and the first list item.
 * Block termination rules:
 *   - A `##` or `###` header always terminates.
 *   - A non-blank, non-item line terminates ONLY after at least one item has been seen.
 *   - Blank lines are skipped (never terminate prematurely).
 */
export function parseOrderedIssueNumbers(description) {
    const ordered = new Set()
    const lines = description.split(/\r?\n/)
    let inOrderBlock = false
    let hasSeenItem = false

    for (const line of lines) {
        if (/^\s*Order:\s*$/.test(line)) {
            inOrderBlock = true
            hasSeenItem = false
            continue
        }

        if (/^\s*(##|###)\s+/.test(line)) {
            inOrderBlock = false
            hasSeenItem = false
            continue
        }

        if (!inOrderBlock) continue

        // Blank lines: skip without terminating (tolerates blank after Order:).
        if (/^\s*$/.test(line)) continue

        const m = line.match(/#(\d+)/)
        if (m) {
            ordered.add(Number(m[1]))
            hasSeenItem = true
            continue
        }

        // Non-blank, non-item line: terminate only if we've already seen an item.
        if (hasSeenItem) {
            inOrderBlock = false
            hasSeenItem = false
        }
    }

    return ordered
}

/**
 * Parse issue numbers listed in `Coordinator:` blocks.
 * Block ends at a blank line (after items have been seen) or a new header.
 */
export function parseCoordinatorIssueNumbers(description) {
    const coordinators = new Set()
    const lines = description.split(/\r?\n/)
    let inCoordBlock = false
    let hasSeenItem = false

    for (const line of lines) {
        if (/^\s*Coordinator:\s*$/.test(line)) {
            inCoordBlock = true
            hasSeenItem = false
            continue
        }

        if (/^\s*(##|###)\s+/.test(line)) {
            inCoordBlock = false
            hasSeenItem = false
            continue
        }

        if (!inCoordBlock) continue

        // Blank line after items → terminate.
        if (/^\s*$/.test(line)) {
            if (hasSeenItem) {
                inCoordBlock = false
                hasSeenItem = false
            }
            continue
        }

        const m = line.match(/#(\d+)/)
        if (m) {
            coordinators.add(Number(m[1]))
            hasSeenItem = true
            continue
        }

        if (hasSeenItem) {
            inCoordBlock = false
            hasSeenItem = false
        }
    }

    return coordinators
}

/** All `#N` mentions anywhere in the description (used for drift detection). */
export function parseReferencedIssueNumbers(description) {
    const referenced = new Set()
    for (const m of description.matchAll(/#(\d+)/g)) {
        referenced.add(Number(m[1]))
    }
    return referenced
}

// ── Private rendering helpers ─────────────────────────────────────────────────

function hasSliceStructure(description) {
    return /^##\s+Delivery slices\b/m.test(description) && /^###\s+Slice\s+\d+\b/m.test(description)
}

function findSectionRange(lines, headerPredicate) {
    const start = lines.findIndex(headerPredicate)
    if (start === -1) return null

    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i])) {
            end = i
            break
        }
    }

    return { start, end }
}

function ensureSlice0(lines) {
    if (lines.some((l) => /^###\s+Slice\s+0\b/.test(l))) return lines

    const deliverySlicesIdx = lines.findIndex((l) => /^##\s+Delivery slices\b/.test(l))
    const firstSliceIdx = lines.findIndex((l, idx) => idx > deliverySlicesIdx && /^###\s+Slice\s+\d+\b/.test(l))

    const slice0Block = [
        '### Slice 0 — Prerequisites (infra)',
        '',
        'Order:',
        PLACEHOLDER_LINE,
        '',
        'Notes:',
        '- Local / low-cost environments may run with Azure OpenAI disabled and rely on safe fallbacks.',
        '- If the milestone requires real AOAI-backed generation (not fallback-only), infra must be complete.',
        ''
    ]

    const out = [...lines]
    const idx = firstSliceIdx === -1 ? out.length : firstSliceIdx
    out.splice(idx, 0, ...slice0Block)
    return out
}

function rewriteSlice0Order(lines, infraIssues) {
    const range = findSectionRange(lines, (l) => /^##\s+Slice\s+0\b/.test(l))
    if (!range) return lines

    const sliceLines = lines.slice(range.start, range.end)

    const orderIdx = sliceLines.findIndex((l) => /^Order:\s*$/.test(l))
    if (orderIdx === -1) return lines

    let listStart = orderIdx + 1
    while (listStart < sliceLines.length && /^\s*$/.test(sliceLines[listStart])) listStart++

    let listEnd = listStart
    while (listEnd < sliceLines.length) {
        const l = sliceLines[listEnd]
        const isItem = /^\s*(\d+\.|-|\*)\s*#\d+/.test(l)
        if (!isItem) break
        listEnd++
    }

    const merged = [...infraIssues].sort((a, b) => a.number - b.number).map((issue, idx) => `${idx + 1}. #${issue.number} ${issue.title}`)

    const updatedSlice = [...sliceLines]
    updatedSlice.splice(listStart, listEnd - listStart, ...merged)

    const out = [...lines]
    out.splice(range.start, range.end - range.start, ...updatedSlice)
    return out
}

function upsertSection(lines, header, bodyLines) {
    const headerRe = new RegExp(`^##\\s+${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
    const range = findSectionRange(lines, (l) => headerRe.test(l))

    const section = [`## ${header}`, '', ...bodyLines, '']

    if (!range) {
        return [...lines, '', ...section]
    }

    const out = [...lines]
    out.splice(range.start, range.end - range.start, ...section)
    return out
}

function formatGap(issue) {
    const labels = issue.labels.length > 0 ? ` (labels: ${issue.labels.join(', ')})` : ''
    return `- #${issue.number} ${issue.title}${labels}`
}

function countByKey(values) {
    const counts = new Map()
    for (const v of values) {
        counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function formatCountsInline(countEntries) {
    if (countEntries.length === 0) return '—'
    return countEntries.map(([k, n]) => `${k} ${n}`).join(', ')
}

function issueUrl(repo, number) {
    return `https://github.com/${repo}/issues/${number}`
}

function formatIssueLine(repo, issue) {
    return `- [#${issue.number}](${issueUrl(repo, issue.number)}) ${issue.title}`
}

// ── Public rendering ──────────────────────────────────────────────────────────

export function buildImpactReportMarkdown({ repo, milestone, issues, superseded }) {
    const effectiveIssues = issues.filter((i) => !isSuperseded(i))
    const open = effectiveIssues.filter((i) => i.state === 'open')
    const closed = effectiveIssues.filter((i) => i.state === 'closed')

    const typeLabels = effectiveIssues
        .map((i) => i.labels)
        .flat()
        .filter((l) => ['feature', 'enhancement', 'refactor', 'infra', 'docs', 'test', 'spike'].includes(l))

    const scopeLabels = effectiveIssues
        .map((i) => i.labels)
        .flat()
        .filter((l) => l.startsWith('scope:'))

    const milestoneUrl = `https://github.com/${repo}/milestone/${milestone.number}`

    const maxList = 25
    const openList = open
        .slice()
        .sort((a, b) => a.number - b.number)
        .slice(0, maxList)
        .map((i) => formatIssueLine(repo, i))
    const openMore = open.length > maxList ? open.length - maxList : 0

    const supersededList = superseded
        .slice()
        .sort((a, b) => a.number - b.number)
        .slice(0, maxList)
        .map((i) => formatIssueLine(repo, i))
    const supersededMore = superseded.length > maxList ? superseded.length - maxList : 0

    const lines = []
    lines.push('## Delivery impact report (auto)')
    lines.push('')
    lines.push(`Milestone: **${milestone.title}** (#[${milestone.number}](${milestoneUrl})) — state: **${milestone.state}**`)
    lines.push('')
    lines.push('Issue summary (excluding PRs):')
    lines.push(`- Total (effective): ${effectiveIssues.length}`)
    lines.push(`- Closed: ${closed.length}`)
    lines.push(`- Open: ${open.length}`)

    if (milestone.state === 'closed' && open.length > 0) {
        lines.push('')
        lines.push('⚠️ Milestone is closed but still has open issues. Consider moving these to a follow-up milestone.')
    }

    lines.push('')
    lines.push(`Milestone board: ${milestoneUrl}`)
    lines.push('')
    lines.push('Label breakdown (effective issues):')
    lines.push(`- Types: ${formatCountsInline(countByKey(typeLabels))}`)
    lines.push(`- Scopes: ${formatCountsInline(countByKey(scopeLabels))}`)

    lines.push('')
    lines.push('Carryover candidates (open):')
    if (openList.length === 0) {
        lines.push('- (none)')
    } else {
        lines.push(...openList)
        if (openMore > 0) lines.push(`- …and ${openMore} more`)
    }

    if (superseded.length > 0) {
        lines.push('')
        lines.push('Superseded / duplicates (closed):')
        lines.push(...supersededList)
        if (supersededMore > 0) lines.push(`- …and ${supersededMore} more`)
    }

    lines.push('')
    lines.push('_This section is auto-generated and will be overwritten on re-run. Put human context above this block._')

    return lines.join('\n')
}

export function upsertAutoGeneratedBlock(description, blockMarkdown) {
    const startIdx = description.indexOf(AUTO_BLOCK_START)
    const endIdx = description.indexOf(AUTO_BLOCK_END)

    const normalizedBlock = [AUTO_BLOCK_START, blockMarkdown.trimEnd(), AUTO_BLOCK_END].join('\n')

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const before = description.slice(0, startIdx).trimEnd()
        const after = description.slice(endIdx + AUTO_BLOCK_END.length).trimStart()
        const sep1 = before.length > 0 ? '\n\n' : ''
        const sep2 = after.length > 0 ? '\n\n' : ''
        return `${before}${sep1}${normalizedBlock}${sep2}${after}`.trimEnd()
    }

    const base = description.trimEnd()
    if (base.length === 0) return normalizedBlock
    return `${base}\n\n${normalizedBlock}`
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Produce an updated milestone description deterministically.
 *
 * Conservative contract:
 *   - When no dependency data is provided (`subIssuesByNumber` empty), existing
 *     `Order:` blocks are preserved exactly — nothing is reordered.
 *   - Gap detection uses `parseOrderedIssueNumbers` (not raw `#N` mentions) so
 *     issues referenced only in notes are not mistaken for ordered items.
 *   - Open epics not in any `Order:` block are surfaced as coordinator annotations,
 *     not as unplaced gaps.
 *
 * @param {{ repo, milestone, issues, subIssuesByNumber, existingDescription }} opts
 * @returns {{ description: string, summary: object }}
 */
export function buildCanonicalDescription({ repo, milestone, issues, existingDescription }) {
    const description = existingDescription ?? ''

    const superseded = issues.filter(isSuperseded)
    const effectiveIssues = issues.filter((i) => !isSuperseded(i))

    const inMilestone = new Set(effectiveIssues.map((i) => i.number))
    const inOrderedSet = parseOrderedIssueNumbers(description)
    const inCoordinatorSet = parseCoordinatorIssueNumbers(description)
    const referencedInDescription = parseReferencedIssueNumbers(description)

    // Gap analysis: only open issues can be misplaced.
    const openEffective = effectiveIssues.filter((i) => i.state === 'open')

    // Unordered = open issues not in any Order block (includes epics).
    const unordered = openEffective.filter((i) => !inOrderedSet.has(i.number))

    // Gaps = non-epic open issues not in any Order block (epics handled separately).
    const gaps = openEffective.filter((i) => !inOrderedSet.has(i.number) && !isEpic(i))

    // Open epics not placed in either an Order block or a Coordinator section.
    const openEpicsUnplaced = openEffective.filter((i) => isEpic(i) && !inOrderedSet.has(i.number) && !inCoordinatorSet.has(i.number))

    const missingFromMilestone = [...inOrderedSet].filter((n) => !inMilestone.has(n)).sort((a, b) => a - b)

    const infraUnordered = unordered.filter(isInfra)
    const unplaced = gaps.filter((i) => !isInfra(i))

    let lines = description.split(/\r?\n/)

    if (hasSliceStructure(description)) {
        if (/^###\s+Slice\s+0\b/m.test(description) || infraUnordered.length > 0) {
            lines = ensureSlice0(lines)
            lines = rewriteSlice0Order(lines, infraUnordered)
        }

        if (openEpicsUnplaced.length > 0) {
            lines = upsertSection(lines, 'Coordinators (epics)', openEpicsUnplaced.sort((a, b) => a.number - b.number).map(formatGap))
        }

        if (unplaced.length > 0) {
            lines = upsertSection(lines, 'Unplaced gaps (needs decision)', unplaced.sort((a, b) => a.number - b.number).map(formatGap))
        }

        if (missingFromMilestone.length > 0) {
            lines = upsertSection(
                lines,
                'Ordering drift (in description but not in milestone)',
                missingFromMilestone.map((n) => `- #${n}`)
            )
        }
    }

    const baseDescription = lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()
    const impactBlock = buildImpactReportMarkdown({ repo, milestone, issues, superseded })
    const finalDescription = upsertAutoGeneratedBlock(baseDescription, impactBlock)

    const summary = {
        milestone: { number: milestone.number, title: milestone.title, state: milestone.state },
        issuesInMilestone: effectiveIssues.length,
        orderedInDescription: inOrderedSet.size,
        referencedInDescription: referencedInDescription.size,
        supersededInMilestone: superseded.map((s) => s.number),
        gaps: gaps.map((g) => g.number),
        infraUnordered: infraUnordered.map((g) => g.number),
        epicGaps: openEpicsUnplaced.map((g) => g.number),
        unplacedGaps: unplaced.map((g) => g.number),
        missingFromMilestone,
        usedSliceTemplate: hasSliceStructure(description)
    }

    return { description: finalDescription, summary }
}
