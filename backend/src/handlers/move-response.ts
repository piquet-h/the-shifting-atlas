import type { HttpResponseInit } from '@azure/functions'
import { errorResponse, okResponse } from './utils/responseBuilder.js'
import type { MoveResult } from './move-core.js'

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
            default:
                errorMessage = moveResult.error?.reason || 'Movement failed'
        }
        return errorResponse(statusCode, errorCode, errorMessage, { correlationId })
    }
    return okResponse(moveResult.location, { correlationId })
}
