import { app } from '@azure/functions'
import { getPromptTemplateHandler } from '../handlers/getPromptTemplate.js'

app.http('GetPromptTemplate', {
    route: 'prompts/{id}',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getPromptTemplateHandler
})
