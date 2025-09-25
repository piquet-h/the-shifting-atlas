import crypto from 'crypto'

export interface PromptTemplateMeta {
    name: string
    version: string
    hash: string
    purpose: string
    body: string
}

const templates: Omit<PromptTemplateMeta, 'hash'>[] = [
    {
        name: 'ambience.room.v1',
        version: '0.1.0',
        purpose: 'Generate a short ambient sensory line for a room (no spoilers, <= 120 chars).',
        body: `You are an ambience generator. Given a room name and existing description, output a single flavorful sensory line (sound, air, subtle motion). No monsters, no exits, no player references. Plain text only.`
    }
]

let cache: PromptTemplateMeta[] | null = null

function computeHash(body: string): string {
    return 'sha256:' + crypto.createHash('sha256').update(body, 'utf8').digest('hex')
}

export function listTemplates(): PromptTemplateMeta[] {
    if (!cache) cache = templates.map((t) => ({...t, hash: computeHash(t.body)}))
    return cache
}

export function getTemplate(name: string): PromptTemplateMeta | undefined {
    return listTemplates().find((t) => t.name === name)
}
