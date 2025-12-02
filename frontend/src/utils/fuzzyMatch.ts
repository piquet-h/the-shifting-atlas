/**
 * String utilities for fuzzy matching and distance calculations
 */

/**
 * Calculate Levenshtein edit distance between two strings.
 * Used for typo tolerance and fuzzy command matching.
 *
 * ALGORITHM: Dynamic programming matrix approach.
 * TIME COMPLEXITY: O(n*m) where n,m are string lengths.
 * SPACE COMPLEXITY: O(n*m) for matrix storage.
 *
 * @param a First string
 * @param b Second string
 * @returns Edit distance between the strings
 *
 * @example
 * levenshteinDistance("north", "nrth") // 1 (deletion)
 * levenshteinDistance("east", "esst") // 1 (substitution)
 */
export function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
            }
        }
    }

    return matrix[b.length][a.length]
}

/**
 * Find closest match from a list of options using Levenshtein distance.
 * Returns null if no match within threshold (max distance: 2).
 *
 * @param input Input string to match
 * @param options List of possible matches
 * @param maxDistance Maximum edit distance to consider (default: 2)
 * @returns Closest matching option or null
 *
 * @example
 * findClosestMatch("ping", ["ping", "look", "move"]) // "ping"
 * findClosestMatch("pong", ["ping", "look", "move"]) // "ping"
 * findClosestMatch("xyz", ["ping", "look", "move"]) // null
 */
export function findClosestMatch(input: string, options: string[], maxDistance: number = 2): string | null {
    let minDistance = Infinity
    let closest: string | null = null

    for (const option of options) {
        const distance = levenshteinDistance(input.toLowerCase(), option.toLowerCase())
        if (distance < minDistance && distance <= maxDistance) {
            minDistance = distance
            closest = option
        }
    }

    return closest
}
