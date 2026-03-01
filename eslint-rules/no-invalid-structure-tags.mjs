/**
 * ESLint rule: no-invalid-structure-tags
 *
 * Validates that `structure:<slug>` and `structureArea:<area>` tag literals
 * appearing in TypeScript string arrays follow the canonical convention defined in
 * docs/architecture/interior-structure-conventions.md.
 *
 * Checks performed on every string literal whose value starts with "structure:" or
 * "structureArea:":
 *
 * 1. structure:<slug>   — slug must be kebab-case ([a-z0-9]+ segments joined by '-').
 * 2. structureArea:<area> — area must be one of the canonical keywords (see
 *    CANONICAL_STRUCTURE_AREAS below).
 * 3. Co-presence: when a string literal array contains either tag, it must contain
 *    BOTH. A `structure:` tag without a `structureArea:` tag (or vice versa) is an
 *    error.
 */

/**
 * Canonical structureArea keywords.
 * Keep in sync with docs/architecture/interior-structure-conventions.md § 1.1.
 */
const CANONICAL_STRUCTURE_AREAS = new Set([
    'outside',
    'common-room',
    'hall',
    'guest-rooms',
    'cellar',
    'upper-floor',
    'kitchen',
    'stable'
])

/** Pattern for a valid kebab-case slug (lowercase alphanumeric, hyphen-separated). */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Pattern for `room:<n>` where n is one or more digits. */
const ROOM_AREA_PATTERN = /^room:\d+$/

function isValidStructureArea(area) {
    return CANONICAL_STRUCTURE_AREAS.has(area) || ROOM_AREA_PATTERN.test(area)
}

/** Tag prefix constants to avoid repeating string literals. */
const STRUCTURE_PREFIX = 'structure:'
const STRUCTURE_AREA_PREFIX = 'structureArea:'

/** Returns true when a tag value is a `structure:<slug>` tag (not a `structureArea:` tag). */
function isStructureTag(value) {
    return value.startsWith(STRUCTURE_PREFIX) && !value.startsWith(STRUCTURE_AREA_PREFIX)
}

/** Returns true when a tag value is a `structureArea:<area>` tag. */
function isStructureAreaTag(value) {
    return value.startsWith(STRUCTURE_AREA_PREFIX)
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Validate structure:<slug> and structureArea:<area> tag literals follow the canonical convention ' +
                '(docs/architecture/interior-structure-conventions.md).'
        },
        messages: {
            invalidSlug:
                '"structure:{{slug}}" has an invalid slug. Slugs must be kebab-case (lowercase alphanumeric segments separated by hyphens).',
            invalidArea:
                '"structureArea:{{area}}" is not a canonical area keyword. ' +
                'Allowed: outside, common-room, hall, guest-rooms, room:<n>, cellar, upper-floor, kitchen, stable. ' +
                'Add new keywords to CANONICAL_STRUCTURE_AREAS in eslint-rules/no-invalid-structure-tags.mjs and to the docs.',
            missingStructureTag:
                'Array contains "structureArea:{{area}}" but no "structure:<slug>" tag. Both must be present together.',
            missingAreaTag:
                'Array contains "structure:{{slug}}" but no "structureArea:<area>" tag. Both must be present together.'
        }
    },
    create(context) {
        return {
            ArrayExpression(node) {
                // Collect all string literals in this array expression.
                const strings = node.elements
                    .filter((el) => el && el.type === 'Literal' && typeof el.value === 'string')
                    .map((el) => ({ node: el, value: el.value }))

                // Validate individual tag formats.
                for (const { node: el, value } of strings) {
                    if (isStructureTag(value)) {
                        const slug = value.slice(STRUCTURE_PREFIX.length)
                        if (!SLUG_PATTERN.test(slug)) {
                            context.report({ node: el, messageId: 'invalidSlug', data: { slug } })
                        }
                    } else if (isStructureAreaTag(value)) {
                        const area = value.slice(STRUCTURE_AREA_PREFIX.length)
                        if (!isValidStructureArea(area)) {
                            context.report({ node: el, messageId: 'invalidArea', data: { area } })
                        }
                    }
                }

                // Check co-presence.
                const structureTags = strings.filter(({ value }) => isStructureTag(value))
                const areaTags = strings.filter(({ value }) => isStructureAreaTag(value))

                if (structureTags.length > 0 && areaTags.length === 0) {
                    for (const { node: el, value } of structureTags) {
                        const slug = value.slice(STRUCTURE_PREFIX.length)
                        context.report({ node: el, messageId: 'missingAreaTag', data: { slug } })
                    }
                }

                if (areaTags.length > 0 && structureTags.length === 0) {
                    for (const { node: el, value } of areaTags) {
                        const area = value.slice(STRUCTURE_AREA_PREFIX.length)
                        context.report({ node: el, messageId: 'missingStructureTag', data: { area } })
                    }
                }
            }
        }
    }
}
