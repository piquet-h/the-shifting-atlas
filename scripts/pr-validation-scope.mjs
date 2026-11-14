#!/usr/bin/env node
/* eslint-env node */

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveDeployUnitAffected, resolveValidationScope } from './lib/pipeline-scope.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OWNERSHIP_PATH = resolve(REPO_ROOT, '.github/pipeline-ownership.json')

function git(...args) {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

function tryGit(...args) {
    try {
        return git(...args)
    } catch {
        return ''
    }
}

function writeOutput(key, value) {
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
    }
    console.log(`${key}=${value}`)
}

function parseArgs(argv) {
    const out = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--deploy-unit' && argv[i + 1]) out.deployUnit = argv[++i]
        else if (arg === '--base' && argv[i + 1]) out.base = argv[++i]
        else if (arg === '--head' && argv[i + 1]) out.head = argv[++i]
        else if (arg === '--force') out.force = true
    }
    return out
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    const manifest = JSON.parse(readFileSync(OWNERSHIP_PATH, 'utf8'))

    if (args.deployUnit) {
        const unit = args.deployUnit
        const tagRef = `refs/tags/deployed-${unit}`
        tryGit('fetch', '--no-tags', 'origin', `+${tagRef}:${tagRef}`)
        const deployedSha = tryGit('rev-parse', '--verify', tagRef)
        const eventBefore =
            process.env.GITHUB_EVENT_BEFORE && !/^0+$/.test(process.env.GITHUB_EVENT_BEFORE) ? process.env.GITHUB_EVENT_BEFORE : ''
        const fallbackBase = eventBefore || tryGit('rev-parse', 'HEAD~1') || 'HEAD'
        const baseSha = deployedSha || fallbackBase

        if (args.force || process.env.FORCE_DEPLOY === 'true') {
            writeOutput('affected', 'true')
            writeOutput('base_sha', baseSha)
            writeOutput('reason', 'forced-dispatch')
            return
        }

        const rawDiff = baseSha === 'HEAD' ? '' : tryGit('diff', '--name-only', `${baseSha}..HEAD`)
        const changedFiles = rawDiff.split(/\r?\n/).filter(Boolean)
        const result = resolveDeployUnitAffected({ unit, changedFiles, manifest })

        writeOutput('affected', String(result.affected))
        writeOutput('base_sha', baseSha)
        writeOutput('matching_count', String(result.matchingFiles.length))
        writeOutput('reason', deployedSha ? `diff-since-deployed-${unit}` : 'diff-since-previous-commit')
        return
    }

    const baseSha = args.base || process.env.PR_BASE_SHA || tryGit('rev-parse', 'HEAD~1')
    const headSha = args.head || process.env.PR_HEAD_SHA || 'HEAD'
    const diffRange = baseSha ? `${baseSha}...${headSha}` : headSha
    const rawFiles = baseSha ? tryGit('diff', '--name-only', diffRange) : tryGit('ls-files')
    const changedFiles = rawFiles.split(/\r?\n/).filter(Boolean)

    const scope = resolveValidationScope(changedFiles, manifest)

    writeOutput('lanes-json', JSON.stringify(scope.lanes))
    writeOutput('legs-json', JSON.stringify(scope.matrixLegs))
    writeOutput('bicep-json', JSON.stringify(scope.bicepFiles))
    writeOutput('formatter-json', JSON.stringify(scope.formatterFiles))
    writeOutput('has-legs', String(scope.matrixLegs.length > 0))

    if (process.env.GITHUB_STEP_SUMMARY) {
        const lines = [
            '### Validation Scope',
            '',
            `- **Changed files**: ${scope.changedFiles.length}`,
            `- **Selected lanes**: ${scope.lanes.length > 0 ? scope.lanes.map((l) => `\`${l}\``).join(', ') : '_(none)_'}`,
            `- **Parallel runner legs**: ${scope.matrixLegs.length > 0 ? scope.matrixLegs.map((l) => `\`${l.id}\``).join(', ') : '_(none)_'}`,
            ''
        ]
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'))
    }
}

main()
