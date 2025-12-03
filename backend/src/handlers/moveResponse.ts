import type { HttpResponseInit } from '@azure/functions'
import { errorResponse, okResponse } from './utils/responseBuilder.js'
import type { MoveResult } from './moveCore.js'

// Maps MoveResult (core movement outcome) to HttpResponseInit using shared ok/err envelope.
export function buildMoveResponse(moveResult: MoveResult, correlationId: string): HttpResponseInit {
    if (!moveResult.success) {
        const errorType = moveResult.error?.type || 'unknown'
        const statusCode = moveResult.error?.statusCode || 500
        const errorCodeMap: Record<string, string> = {
            ambiguous: 'AmbiguousDirection',
            'invalid-direction': 'InvalidDirection',
            'from-missing': 'FromNotFound',
            'no-exit': 'NoExit',
            generate: 'ExitGenerationRequested',
            'move-failed': 'MoveFailed'
        }
        const errorCode = errorCodeMap[errorType] || 'MoveFailed'
        let errorMessage: string
        switch (errorType) {
            case 'ambiguous':
                errorMessage = moveResult.error?.clarification || 'Ambiguous direction'
                break
            case 'invalid-direction':
                errorMessage = moveResult.error?.clarification || 'Invalid or missing direction'
                break
            case 'from-missing':
                errorMessage = 'Current location not found'
                break
            case 'no-exit':
                errorMessage = 'No such exit'
                break
            case 'generate':
                errorMessage = moveResult.error?.clarification || 'Exit generation requested'
                break
            default:
                errorMessage = moveResult.error?.reason || 'Movement failed'
        }

        // Include generationHint in response payload for 'generate' status
        const responseData: Record<string, unknown> = {}
        if (errorType === 'generate' && moveResult.error?.generationHint) {
            responseData.generationHint = moveResult.error.generationHint
        }

        return errorResponse(statusCode, errorCode, errorMessage, { correlationId, ...responseData })
    }
    return okResponse(moveResult.location, { correlationId })
}
