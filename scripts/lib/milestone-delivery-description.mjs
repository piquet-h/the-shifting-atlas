const AUTO_BLOCK_ID = 'milestone-impact-report'
export const AUTO_BLOCK_START = `<!-- AUTO-GENERATED: ${AUTO_BLOCK_ID}:start -->`
export const AUTO_BLOCK_END = `<!-- AUTO-GENERATED: ${AUTO_BLOCK_ID}:end -->`
export const PLACEHOLDER_LINE = '- (add issues, then reorder)'

const EXECUTABLE_TYPE_PRIORITY = ['infra', 'feature', 'enhancement', 'refactor', 'spike', 'test', 'docs']

function normalizeIssue(issue) {
    return {
        ...issue,
        labels: [...(issue.labels ?? [])],
        blockedBy: [...(issue.blockedBy ?? [])],
        body: issue.body ?? '',
        state_reason: issue.state_reason ?? null
    }
}

export function hasDeliverySlices(description) {
    return /^##\s+Delivery slices\b/m.test(description ?? '')
}

export function extractDepsFromBody(issueBody) {
    const deps = new Set()
    if (!issueBody) return deps

    const patterns = [/\bblocked\s+by\s+#(\d+)/gi, /\bdepends\s+on\s+#(\d+)/gi, /\brequires\s+#(\d+)/gi]

    for (const pattern of patterns) {
        for (const match of issueBody.matchAll(pattern)) {
            deps.add(Number(match[1]))
        }
    }

    return deps
}

export function buildDependencyGraph(issues, subIssuesByNumber = new Map()) {
    const graph = new Map()

    for (const issue of issues ?? []) {
        graph.set(issue.number, extractDepsFromBody(issue.body ?? ''))
    }

    for (const [parentNumber, subIssues] of subIssuesByNumber) {
        for (const subIssue of subIssues ?? []) {
            if (!graph.has(subIssue.number)) {
                graph.set(subIssue.number, new Set())
            }
            graph.get(subIssue.number).add(parentNumber)
        }
    }

    return graph
}

export function parseOrderedIssueNumbers(description) {
    const ordered = []
    const seen = new Set()
    const lines = (description ?? '').split(/\r?\n/)
    let inOrderBlock = false
    let startedItems = false

    for (const line of lines) {
        if (/^\s*Order:\s*$/.test(line)) {
            inOrderBlock = true
            startedItems = false
            continue
        }

        if (!inOrderBlock) continue

        if (/^\s*(##|###)\s+/.test(line)) {
            inOrderBlock = false
            startedItems = false
            continue
        }

        if (!line.trim()) {
            if (startedItems) {
                inOrderBlock = false
                startedItems = false
            }
            continue
        }

        const match = line.match(/^\s*(?:\d+\.|-|\*)\s+#(\d+)\b/)
        if (match) {
            const number = Number(match[1])
            if (!seen.has(number)) {
                ordered.push(number)
                seen.add(number)
            }
            startedItems = true
            continue
        }

        if (startedItems) {
            inOrderBlock = false
            startedItems = false
        }
    }

    return ordered
}

export function parseCoordinatorIssueNumbers(description) {
    const coordinators = []
    const seen = new Set()
    const lines = (description ?? '').split(/\r?\n/)
    let inCoordinatorBlock = false

    for (const line of lines) {
        if (/^\s*Coordinator:\s*$/.test(line)) {
            inCoordinatorBlock = true
            continue
        }

        if (!inCoordinatorBlock) continue

        if (/^\s*(##|###)\s+/.test(line) || /^\s*Order:\s*$/.test(line)) {
            inCoordinatorBlock = false
            continue
        }

        if (!line.trim()) continue

        const match = line.match(/^\s*(?:\d+\.|-|\*)\s+#(\d+)\b/)
        if (match) {
            const number = Number(match[1])
            if (!seen.has(number)) {
                coordinators.push(number)
                seen.add(number)
            }
            continue
        }

        inCoordinatorBlock = false
    }

    return coordinators
}

export function topologicalLayers(nodes, dependencyGraph) {
    const sortedNodes = [...nodes].sort((a, b) => a - b)
    const depMap = new Map(sortedNodes.map((node) => [node, new Set(dependencyGraph.get(node) ?? [])]))
    const remaining = new Set(sortedNodes)
    const layers = []

    while (remaining.size > 0) {
        const ready = [...remaining].filter((node) => (depMap.get(node) ?? new Set()).size === 0).sort((a, b) => a - b)
        if (ready.length === 0) {
            break
        }

        layers.push(ready)

        for (const node of ready) {
            remaining.delete(node)
        }

        for (const node of remaining) {
            const deps = depMap.get(node)
            for (const readyNode of ready) {
                deps.delete(readyNode)
            }
        }
    }

    return {
        layers,
        remaining: [...remaining].sort((a, b) => a - b)
    }
}

export function isEpic(issue) {
    return new Set(issue.labels).has('epic')
}

export function isSuperseded(issue) {
    if (issue.state !== 'closed') return false
    if (issue.state_reason === 'not_planned') return true

    const title = issue.title.toLowerCase()
    const body = issue.body.toLowerCase()

    return (
        title.includes('duplicate') ||
        body.includes('duplicate issue') ||
        body.includes('this issue has been split') ||
        body.includes('see correct split issues')
    )
}

function isClosedGroundwork(issue) {
    return issue.state === 'closed' && !isSuperseded(issue)
}

function issueTypePriority(issue) {
    const labels = new Set(issue.labels)
    for (let idx = 0; idx < EXECUTABLE_TYPE_PRIORITY.length; idx++) {
        if (labels.has(EXECUTABLE_TYPE_PRIORITY[idx])) return idx
    }
    return EXECUTABLE_TYPE_PRIORITY.length
}

function compareExecutableIssues(a, b) {
    const priorityDelta = issueTypePriority(a) - issueTypePriority(b)
    if (priorityDelta !== 0) return priorityDelta
    return a.number - b.number
}

function countByKey(values) {
    const counts = new Map()
    for (const value of values) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function formatCountsInline(countEntries) {
    if (countEntries.length === 0) return '—'
    return countEntries.map(([k, n]) => `${k} ${n}`).join(', ')
}

function issueUrl(repo, number) {
    return repo ? `https://github.com/${repo}/issues/${number}` : null
}

function formatIssueReference(repo, issue) {
    const url = issueUrl(repo, issue.number)
    if (!url) return `#${issue.number} ${issue.title}`
    return `[#${issue.number}](${url}) ${issue.title}`
}

function renderIssueList(repo, issues, numbered = false) {
    if (issues.length === 0) {
        return [numbered ? PLACEHOLDER_LINE : '- (none)']
    }

    return issues.map((issue, index) => {
        const prefix = numbered ? `${index + 1}. ` : '- '
        return `${prefix}${formatIssueReference(repo, issue)}`
    })
}

function buildDependencyGraphData(openIssues) {
    const openByNumber = new Map(openIssues.map((issue) => [issue.number, issue]))
    const dependencyGraph = new Map()
    const milestoneBlockedBy = new Map()
    const externalBlockedBy = new Map()

    for (const issue of openIssues) {
        const milestoneBlockers = []
        const externalBlockers = []

        for (const blocker of issue.blockedBy) {
            if (openByNumber.has(blocker.number)) {
                milestoneBlockers.push(blocker.number)
                continue
            }

            if (blocker.state !== 'closed') {
                externalBlockers.push(blocker)
            }
        }

        milestoneBlockers.sort((a, b) => a - b)
        externalBlockers.sort((a, b) => a.number - b.number)

        dependencyGraph.set(issue.number, new Set(milestoneBlockers))
        milestoneBlockedBy.set(issue.number, milestoneBlockers)
        externalBlockedBy.set(issue.number, externalBlockers)
    }

    return {
        dependencyGraph,
        milestoneBlockedBy,
        externalBlockedBy
    }
}

function directDependencyViolations(layerIssues, milestoneBlockedBy, positionByIssue) {
    const violations = []
    for (const issue of layerIssues) {
        for (const blocker of milestoneBlockedBy.get(issue.number) ?? []) {
            if ((positionByIssue.get(blocker) ?? -1) > (positionByIssue.get(issue.number) ?? -1)) {
                violations.push({ blocker, blocked: issue.number })
            }
        }
    }
    return violations.sort((a, b) => a.blocked - b.blocked || a.blocker - b.blocker)
}

function buildSliceData(openIssues) {
    const { dependencyGraph, milestoneBlockedBy, externalBlockedBy } = buildDependencyGraphData(openIssues)
    const externalBlocked = openIssues
        .filter((issue) => (externalBlockedBy.get(issue.number) ?? []).length > 0)
        .sort(compareExecutableIssues)

    const layerCandidates = openIssues
        .filter((issue) => (externalBlockedBy.get(issue.number) ?? []).length === 0)
        .map((issue) => issue.number)

    const { layers, remaining } = topologicalLayers(layerCandidates, dependencyGraph)
    const issueByNumber = new Map(openIssues.map((issue) => [issue.number, issue]))
    const layerIndexByNumber = new Map()

    layers.forEach((layer, layerIndex) => {
        for (const number of layer) {
            layerIndexByNumber.set(number, layerIndex)
        }
    })

    const slices = layers.map((numbers, layerIndex) => {
        const layerIssues = numbers.map((number) => issueByNumber.get(number))
        const coordinators = layerIssues.filter(isEpic).sort((a, b) => a.number - b.number)
        const executable = layerIssues.filter((issue) => !isEpic(issue)).sort(compareExecutableIssues)
        const positionByIssue = new Map(executable.map((issue, idx) => [issue.number, idx]))
        const dependencyViolations = directDependencyViolations(executable, milestoneBlockedBy, positionByIssue)
        const dependsOnSlices = new Set()

        for (const issue of layerIssues) {
            for (const blocker of milestoneBlockedBy.get(issue.number) ?? []) {
                const blockerLayer = layerIndexByNumber.get(blocker)
                if (blockerLayer !== undefined && blockerLayer < layerIndex) {
                    dependsOnSlices.add(blockerLayer + 1)
                }
            }
        }

        return {
            index: layerIndex + 1,
            title: `Dependency layer ${layerIndex + 1}`,
            coordinators,
            executable,
            dependsOnSlices: [...dependsOnSlices].sort((a, b) => a - b),
            dependencyViolations
        }
    })

    return {
        slices,
        externalBlocked,
        dependencyConflicts: remaining.map((number) => issueByNumber.get(number)).sort(compareExecutableIssues),
        milestoneBlockedBy
    }
}

export function buildImpactReportMarkdown({ repo, milestone, openIssues, closedGroundwork, superseded }) {
    const typeLabels = openIssues
        .map((issue) => issue.labels)
        .flat()
        .filter((label) => EXECUTABLE_TYPE_PRIORITY.includes(label))

    const scopeLabels = openIssues
        .map((issue) => issue.labels)
        .flat()
        .filter((label) => label.startsWith('scope:'))

    const milestoneUrl = issueUrl(repo, milestone.number)?.replace(`/issues/${milestone.number}`, `/milestone/${milestone.number}`)
    const lines = []

    lines.push('## Delivery impact report (auto)')
    lines.push('')
    if (milestoneUrl) {
        lines.push(`Milestone: **${milestone.title}** (#[${milestone.number}](${milestoneUrl})) — state: **${milestone.state}**`)
    } else {
        lines.push(`Milestone: **${milestone.title}** (#${milestone.number}) — state: **${milestone.state}**`)
    }
    lines.push('')
    lines.push('Issue summary (excluding PRs):')
    lines.push(`- Open: ${openIssues.length}`)
    lines.push(`- Closed groundwork: ${closedGroundwork.length}`)
    lines.push(`- Superseded / not planned: ${superseded.length}`)
    lines.push('')
    lines.push('Label breakdown (open issues):')
    lines.push(`- Types: ${formatCountsInline(countByKey(typeLabels))}`)
    lines.push(`- Scopes: ${formatCountsInline(countByKey(scopeLabels))}`)
    lines.push('')
    lines.push('_This section is auto-generated and will be overwritten on re-run. Put human context above this block._')

    return lines.join('\n')
}

function renderDependencySummaryLines({ repo, slices, externalBlocked, dependencyConflicts, openEpics, closedGroundwork }) {
    const lines = []
    lines.push('## Dependency summary')
    lines.push('')
    lines.push(`- Open coordinator epics: ${openEpics.length}`)
    lines.push(`- Closed groundwork: ${closedGroundwork.length}`)
    lines.push(`- Dependency layers: ${Math.max(slices.length, 1)}`)
    lines.push(`- Blocked outside this milestone: ${externalBlocked.length}`)
    lines.push(`- Dependency conflicts: ${dependencyConflicts.length}`)

    if (externalBlocked.length > 0) {
        lines.push('')
        lines.push('External blockers:')
        for (const issue of externalBlocked) {
            const blockers = issue.blockedBy.filter((blocker) => blocker.state !== 'closed')
            const blockerSummary = blockers.map((blocker) => `#${blocker.number} ${blocker.title}`).join(', ')
            lines.push(`- ${formatIssueReference(repo, issue)} blocked by ${blockerSummary}`)
        }
    }

    if (dependencyConflicts.length > 0) {
        lines.push('')
        lines.push('Dependency conflicts requiring a manual decision:')
        for (const issue of dependencyConflicts) {
            lines.push(`- ${formatIssueReference(repo, issue)}`)
        }
    }

    return lines
}

function renderClosedGroundworkSection(repo, closedGroundwork) {
    const lines = []
    lines.push('## Closed groundwork')
    lines.push('')
    lines.push(...renderIssueList(repo, closedGroundwork, false))
    return lines
}

function renderSliceSection(repo, slices) {
    const lines = []
    lines.push('## Delivery slices')
    lines.push('')

    if (slices.length === 0) {
        lines.push('### Slice 1 — Dependency layer 1')
        lines.push('')
        lines.push('Order:')
        lines.push('')
        lines.push(PLACEHOLDER_LINE)
        return lines
    }

    for (const slice of slices) {
        lines.push(`### Slice ${slice.index} — ${slice.title}`)
        lines.push('')

        if (slice.dependsOnSlices.length > 0) {
            lines.push('Depends on:')
            for (const dependencySlice of slice.dependsOnSlices) {
                lines.push(`- Slice ${dependencySlice} complete`)
            }
            lines.push('')
        }

        if (slice.coordinators.length > 0) {
            lines.push('Coordinator:')
            lines.push(...renderIssueList(repo, slice.coordinators, false))
            lines.push('')
        }

        lines.push('Order:')
        lines.push('')
        lines.push(...renderIssueList(repo, slice.executable, true))
        lines.push('')
    }

    return lines
}

function renderExternalBlockedSection(repo, externalBlocked) {
    if (externalBlocked.length === 0) return []

    const lines = []
    lines.push('## Blocked outside this milestone')
    lines.push('')
    for (const issue of externalBlocked) {
        lines.push(`- ${formatIssueReference(repo, issue)}`)
        for (const blocker of issue.blockedBy.filter((candidate) => candidate.state !== 'closed').sort((a, b) => a.number - b.number)) {
            lines.push(`  - blocked by #${blocker.number} ${blocker.title}`)
        }
    }
    return lines
}

function renderDependencyConflictSection(repo, dependencyConflicts) {
    if (dependencyConflicts.length === 0) return []

    const lines = []
    lines.push('## Dependency conflicts (needs decision)')
    lines.push('')
    lines.push(...renderIssueList(repo, dependencyConflicts, false))
    return lines
}

export function generateMilestoneDescription({ repo, milestone, issues }) {
    const normalizedIssues = (issues ?? []).map(normalizeIssue)
    const superseded = normalizedIssues.filter(isSuperseded).sort((a, b) => a.number - b.number)
    const effectiveIssues = normalizedIssues.filter((issue) => !isSuperseded(issue))
    const openIssues = effectiveIssues.filter((issue) => issue.state === 'open').sort(compareExecutableIssues)
    const openEpics = openIssues.filter(isEpic)
    const closedGroundwork = effectiveIssues.filter(isClosedGroundwork).sort((a, b) => a.number - b.number)
    const { slices, externalBlocked, dependencyConflicts, milestoneBlockedBy } = buildSliceData(openIssues)
    const dependencyViolations = slices.map((slice) => slice.dependencyViolations).flat()

    const descriptionLines = [
        `${milestone.title} delivery plan is machine-generated from GitHub milestone membership and formal dependencies.`,
        '',
        'Edit issues, epics, and dependency links; rerun the milestone scripts instead of hand-editing this description.',
        '',
        ...renderDependencySummaryLines({ repo, slices, externalBlocked, dependencyConflicts, openEpics, closedGroundwork }),
        '',
        ...renderClosedGroundworkSection(repo, closedGroundwork),
        '',
        ...renderSliceSection(repo, slices),
        ...(() => {
            const externalLines = renderExternalBlockedSection(repo, externalBlocked)
            return externalLines.length > 0 ? ['', ...externalLines] : []
        })(),
        ...(() => {
            const conflictLines = renderDependencyConflictSection(repo, dependencyConflicts)
            return conflictLines.length > 0 ? ['', ...conflictLines] : []
        })(),
        '',
        AUTO_BLOCK_START,
        buildImpactReportMarkdown({ repo, milestone, openIssues, closedGroundwork, superseded }),
        AUTO_BLOCK_END
    ]

    const updatedDescription = descriptionLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
    const orderedIssueNumbers = parseOrderedIssueNumbers(updatedDescription)
    const coordinatorIssueNumbers = parseCoordinatorIssueNumbers(updatedDescription)

    const summary = {
        milestone: { number: milestone.number, title: milestone.title, state: milestone.state },
        issuesInMilestone: effectiveIssues.length,
        orderedInDescription: orderedIssueNumbers.length,
        referencedInDescription: orderedIssueNumbers.length + coordinatorIssueNumbers.length + closedGroundwork.length,
        supersededInMilestone: superseded.map((issue) => issue.number),
        gaps: [],
        infraUnordered: [],
        epicGaps: [],
        unplacedGaps: [],
        missingFromMilestone: [],
        usedSliceTemplate: true,
        dependencyViolations,
        dependencyConflicts: dependencyConflicts.map((issue) => issue.number),
        externalBlocked: externalBlocked.map((issue) => issue.number),
        dependencyGraph: Object.fromEntries([...milestoneBlockedBy.entries()].map(([issueNumber, blockers]) => [issueNumber, [...blockers]]))
    }

    return { updatedDescription, summary }
}

export function buildCanonicalDescription({ repo, milestone, issues, existingDescription }) {
    const effectiveMilestone = {
        ...milestone,
        description: existingDescription ?? milestone.description ?? ''
    }

    const { updatedDescription, summary } = generateMilestoneDescription({
        repo,
        milestone: effectiveMilestone,
        issues
    })

    return {
        description: updatedDescription,
        summary
    }
}

export function buildDeliverySlicesTemplate({ repo, milestoneNumber, milestoneTitle, issues }) {
    return generateMilestoneDescription({
        repo,
        milestone: { number: milestoneNumber ?? 0, title: milestoneTitle, state: 'open' },
        issues
    }).updatedDescription
}
