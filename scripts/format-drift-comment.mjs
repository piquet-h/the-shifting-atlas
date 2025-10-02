#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * format-drift-comment.mjs
 * Reads JSON from file (first arg) produced by analyze-doc-drift.mjs and prints
 * a markdown comment summarizing reprioritisation signals.
 */
import fs from 'node:fs'

const file = process.argv[2]
if (!file) {
    console.error('Usage: node format-drift-comment.mjs <drift.json>')
    process.exit(1)
}

let data
try {
    const fileContent = fs.readFileSync(file, 'utf8')
    data = JSON.parse(fileContent)
} catch (err) {
    console.error(`Failed to read or parse JSON file "${file}": ${err.message}`)
    process.exit(1)
}

function table(dimensions) {
    const rows = Object.entries(dimensions)
        .map(([k, v]) => `| ${k} | ${v} |`)
        .join('\n')
    return `| Dimension | Score |\n|-----------|-------|\n${rows}`
}

const findingsList =
    data.findings
        .slice(0, 12)
        .map((f) => `- **${f.dim}**: \`${f.line}\``)
        .join('\n') || '(No specific triggering lines captured)'

let actionLine = ''
if (data.recommendedAction === 'resequence') {
    actionLine = '⚠️ **Recommendation:** Consider resequencing existing issues (score threshold met).'
} else if (data.recommendedAction === 'append') {
    actionLine = 'ℹ️ **Recommendation:** New issues may be appended (no resequencing required).'
} else {
    actionLine = '✅ No reprioritisation action indicated by heuristics.'
}

console.log(
    `### Reprioritisation Signal Analysis\n\n${actionLine}\n\n**Total Score:** ${data.scoreTotal}\n\n${table(data.dimensions)}\n\n**Sample Findings:**\n\n${findingsList}\n\n_Heuristics: strong single-dimension signal (>=4) or total >=7 ⇒ resequence; total 3–6 ⇒ append._`
)
