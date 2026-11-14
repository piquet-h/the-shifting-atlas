#!/usr/bin/env node
/* eslint-env node */

import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INFRA_DIR = join(REPO_ROOT, 'infrastructure')

function findBicepTemplates() {
    if (process.env.BICEP_FILES_JSON) {
        try {
            const parsed = JSON.parse(process.env.BICEP_FILES_JSON)
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((rel) => resolve(REPO_ROOT, rel))
            }
        } catch {
            // Fall through to full directory scan
        }
    }
    return readdirSync(INFRA_DIR)
        .filter((name) => name.endsWith('.bicep'))
        .sort()
        .map((name) => join(INFRA_DIR, name))
}

function main() {
    const started = performance.now()
    const templates = findBicepTemplates()
    const azCmd = process.platform === 'win32' ? 'az.cmd' : 'az'

    const tempOutDir = mkdtempSync(join(tmpdir(), 'atlas-bicep-out-'))
    try {
        console.log(`[pr-validation-bicep] Compiling ${templates.length} Bicep template(s) offline...`)
        for (const templatePath of templates) {
            console.log(`  -> ${templatePath}`)
            const outFile = join(tempOutDir, `${basename(templatePath, '.bicep')}.json`)
            const result = spawnSync(azCmd, ['bicep', 'build', '--file', templatePath, '--outfile', outFile], {
                cwd: REPO_ROOT,
                env: {
                    ...process.env,
                    AZURE_CORE_COLLECT_TELEMETRY: 'false'
                },
                stdio: ['ignore', 'ignore', 'inherit'],
                shell: process.platform === 'win32'
            })
            if (result.error) throw result.error
            if (result.status !== 0) {
                throw new Error(`Offline Bicep compilation failed for ${templatePath} (exit ${result.status})`)
            }
        }
    } finally {
        rmSync(tempOutDir, { recursive: true, force: true })
    }

    console.log('[pr-validation-bicep] Running workbook export drift check (advisory)...')
    const workbookCheck = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/observability/verify-workbooks.mjs')], {
        cwd: REPO_ROOT,
        stdio: 'inherit'
    })
    const workbookStatus = workbookCheck.status === 0 ? 'clean' : 'advisory-drift'

    const elapsedSec = ((performance.now() - started) / 1000).toFixed(2)
    console.log(`[pr-validation-bicep] Validated ${templates.length} template(s) in ${elapsedSec}s (workbooks: ${workbookStatus}).`)

    if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
            process.env.GITHUB_STEP_SUMMARY,
            `\n### Infrastructure Offline Validation\n- Compiled **${templates.length}** Bicep template(s) in **${elapsedSec}s** (zero Azure credentials; workbooks: \`${workbookStatus}\`).\n`
        )
    }
}

main()
