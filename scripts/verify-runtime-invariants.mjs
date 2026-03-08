#!/usr/bin/env node
/* eslint-env node */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function findRepoRoot(startDir) {
    let current = startDir
    while (true) {
        const candidate = resolve(current, '.github')
        if (existsSync(candidate)) return current
        const parent = dirname(current)
        if (parent === current) return startDir
        current = parent
    }
}

const ROOT = process.env.VERIFY_RUNTIME_INVARIANTS_ROOT
    ? resolve(process.env.VERIFY_RUNTIME_INVARIANTS_ROOT)
    : findRepoRoot(process.cwd())
const CONSUMER_PACKAGES = ['backend/package.json', 'frontend/package.json']
const SHARED_PACKAGE_NAME = '@piquet-h/shared'

function readJson(relativePath) {
    return JSON.parse(readFileSync(resolve(ROOT, relativePath), 'utf8'))
}

function collectIssues() {
    const issues = []

    for (const packagePath of CONSUMER_PACKAGES) {
        const pkg = readJson(packagePath)
        const dependencyValue = pkg.dependencies?.[SHARED_PACKAGE_NAME]

        if (typeof dependencyValue === 'string' && dependencyValue.startsWith('file:')) {
            issues.push({
                type: 'shared-file-reference',
                file: packagePath,
                packageName: pkg.name,
                dependency: SHARED_PACKAGE_NAME,
                value: dependencyValue,
                message: `${packagePath} uses forbidden local file reference for ${SHARED_PACKAGE_NAME}: ${dependencyValue}`
            })
        }
    }

    return issues
}

function main() {
    const args = new Set(process.argv.slice(2))
    const jsonMode = args.has('--json') || process.env.VERIFY_RUNTIME_INVARIANTS_JSON === '1'
    const strictMode = args.has('--strict') || process.env.VERIFY_RUNTIME_INVARIANTS_STRICT === '1'

    const issues = collectIssues()
    const result = {
        status: strictMode && issues.length > 0 ? 'fail' : 'warn',
        mode: strictMode ? 'strict' : 'warn',
        counts: {
            'shared-file-reference': issues.filter((issue) => issue.type === 'shared-file-reference').length
        },
        issues,
        timestamp: new Date().toISOString()
    }

    if (jsonMode) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        process.exit(strictMode && issues.length > 0 ? 1 : 0)
    }

    process.stdout.write(`[verify-runtime-invariants] found ${issues.length} runtime invariant issue(s).\n`)
    for (const issue of issues) {
        process.stderr.write(`[verify-runtime-invariants] WARN ${issue.message}\n`)
    }

    if (strictMode && issues.length > 0) {
        process.stderr.write('[verify-runtime-invariants] FAIL (strict mode) — invariant issues detected.\n')
        process.exit(1)
    }

    process.stdout.write('[verify-runtime-invariants] WARN-ONLY mode complete.\n')
    process.exit(0)
}

main()