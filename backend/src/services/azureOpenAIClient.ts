/**
 * Azure OpenAI Client Service
 *
 * Provides integration with Azure OpenAI API using Managed Identity (DefaultAzureCredential).
 * Handles authentication, model invocation, and error handling.
 *
 * Configuration (Environment Variables):
 * - AZURE_OPENAI_ENDPOINT: Azure OpenAI resource endpoint (e.g., https://myresource.openai.azure.com/)
 * - AZURE_OPENAI_MODEL: Model deployment name (e.g., gpt-4)
 * - AZURE_OPENAI_API_VERSION: API version (default: 2024-10-21)
 *
 * Authentication:
 * - Production: Uses system-assigned Managed Identity
 * - Local dev: Uses DefaultAzureCredential (respects az login credentials)
 */

import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity'
import { injectable } from 'inversify'
import { AzureOpenAI } from 'openai'

export interface AzureOpenAIClientConfig {
    endpoint: string
    model: string
    apiVersion?: string
}

export interface OpenAIGenerateOptions {
    prompt: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
}

export type OpenAIGenerateOutcome = 'success' | 'timeout' | 'error' | 'empty'

export interface OpenAIGenerateDiagnostics {
    outcome: OpenAIGenerateOutcome
    httpStatus?: number
    errorCode?: string
    errorType?: string
    errorName?: string
    // Intentionally not used for low-cardinality dashboards; available for exception/debug only.
    errorMessage?: string
}

export interface OpenAIGenerateWithDiagnosticsResult {
    result: OpenAIGenerateResult | null
    diagnostics: OpenAIGenerateDiagnostics
}

export interface OpenAIGenerateResult {
    content: string
    tokenUsage: {
        prompt: number
        completion: number
        total: number
    }
}

/**
 * Azure OpenAI client interface for testability
 */
export interface IAzureOpenAIClient {
    /**
     * Generate text using Azure OpenAI with bounded timeout
     * @param options Generation options with prompt and timeout
     * @returns Generated content and token usage, or null on error
     * @throws Never - returns null or result, never throws
     */
    generate(options: OpenAIGenerateOptions): Promise<OpenAIGenerateResult | null>

    /**
     * Optional richer generate call for callers that want bounded failure diagnostics.
     * Implementations must still never throw.
     */
    generateWithDiagnostics?(options: OpenAIGenerateOptions): Promise<OpenAIGenerateWithDiagnosticsResult>

    /**
     * Test/health check to verify OpenAI connectivity
     */
    healthCheck(): Promise<boolean>
}

/**
 * No-op OpenAI client (used when Azure OpenAI isn't configured in the environment).
 *
 * Important: This should never throw. It keeps DI and local/test environments stable.
 */
@injectable()
export class NullAzureOpenAIClient implements IAzureOpenAIClient {
    async generate(): Promise<OpenAIGenerateResult | null> {
        return null
    }

    async generateWithDiagnostics(): Promise<OpenAIGenerateWithDiagnosticsResult> {
        return {
            result: null,
            diagnostics: {
                outcome: 'error',
                errorName: 'NullAzureOpenAIClient',
                errorCode: 'not-configured'
            }
        }
    }

    async healthCheck(): Promise<boolean> {
        return false
    }
}

/**
 * Azure OpenAI Client Implementation
 * Uses Managed Identity (DefaultAzureCredential) for authentication
 */
@injectable()
export class AzureOpenAIClient implements IAzureOpenAIClient {
    private client: AzureOpenAI
    private config: AzureOpenAIClientConfig

    constructor(config: AzureOpenAIClientConfig) {
        if (!config.endpoint) {
            throw new Error('AZURE_OPENAI_ENDPOINT is required')
        }
        if (!config.model) {
            throw new Error('AZURE_OPENAI_MODEL is required')
        }

        this.config = config

        // Use Managed Identity (DefaultAzureCredential) for authentication
        // Automatically handles: System-assigned MI (prod), az login (local), OIDC (CI/CD)
        const credential = new DefaultAzureCredential()
        const scope = 'https://cognitiveservices.azure.com/.default'
        const azureADTokenProvider = getBearerTokenProvider(credential, scope)

        this.client = new AzureOpenAI({
            endpoint: config.endpoint,
            azureADTokenProvider,
            deployment: config.model,
            apiVersion: config.apiVersion || '2024-10-21'
        })
    }

    async generate(options: OpenAIGenerateOptions): Promise<OpenAIGenerateResult | null> {
        const withDiag = this.generateWithDiagnostics
        if (withDiag) {
            const { result, diagnostics } = await withDiag.call(this, options)
            if (!result && diagnostics.outcome === 'error' && diagnostics.errorMessage) {
                console.error('OpenAI generation error:', diagnostics.errorMessage)
            }
            return result
        }

        // Fallback (should not be used in this codebase; generateWithDiagnostics is implemented).
        return this.generateLegacy(options)
    }

    async generateWithDiagnostics(options: OpenAIGenerateOptions): Promise<OpenAIGenerateWithDiagnosticsResult> {
        const { prompt, maxTokens = 500, temperature = 0.7, timeoutMs = 30000 } = options

        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

        try {
            // Prefer chat completions (matches Foundry/Azure OpenAI modern deployments).
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const chatClient = (this.client as any).chat?.completions
                if (chatClient && typeof chatClient.create === 'function') {
                    const response = await chatClient.create(
                        {
                            messages: [{ role: 'user', content: prompt }],
                            model: this.config.model,
                            max_tokens: maxTokens,
                            temperature
                        },
                        { signal: controller.signal }
                    )

                    if (!response.choices || response.choices.length === 0) {
                        return { result: null, diagnostics: { outcome: 'empty' } }
                    }

                    const content = (response.choices[0].message?.content || '').trim()
                    if (!content) {
                        return { result: null, diagnostics: { outcome: 'empty' } }
                    }

                    return {
                        result: {
                            content,
                            tokenUsage: {
                                prompt: response.usage?.prompt_tokens ?? 0,
                                completion: response.usage?.completion_tokens ?? 0,
                                total: response.usage?.total_tokens ?? 0
                            }
                        },
                        diagnostics: { outcome: 'success' }
                    }
                }
            } catch (error) {
                const diag = this.extractDiagnostics(error)

                // Check for timeout (AbortError)
                if (diag.errorName === 'AbortError') {
                    return {
                        result: null,
                        diagnostics: {
                            outcome: 'timeout',
                            errorName: diag.errorName,
                            errorCode: diag.errorCode,
                            errorType: diag.errorType,
                            httpStatus: diag.httpStatus
                        }
                    }
                }

                // If chat completions yields 404, fall back to legacy completions.
                if (diag.httpStatus !== 404) {
                    return {
                        result: null,
                        diagnostics: {
                            outcome: 'error',
                            errorName: diag.errorName,
                            errorCode: diag.errorCode,
                            errorType: diag.errorType,
                            httpStatus: diag.httpStatus,
                            errorMessage: diag.errorMessage
                        }
                    }
                }
            }

            // Legacy completions fallback.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const legacyClient = (this.client as any).completions
            if (!legacyClient || typeof legacyClient.create !== 'function') {
                return {
                    result: null,
                    diagnostics: {
                        outcome: 'error',
                        errorName: 'AzureOpenAIClient',
                        errorCode: 'missing-client'
                    }
                }
            }

            const response = await legacyClient.create(
                {
                    prompt,
                    model: this.config.model,
                    max_tokens: maxTokens,
                    temperature
                },
                { signal: controller.signal }
            )

            if (!response.choices || response.choices.length === 0) {
                return { result: null, diagnostics: { outcome: 'empty' } }
            }

            const content = (response.choices[0].text || '').trim()
            if (!content) {
                return { result: null, diagnostics: { outcome: 'empty' } }
            }

            return {
                result: {
                    content,
                    tokenUsage: {
                        prompt: response.usage?.prompt_tokens ?? 0,
                        completion: response.usage?.completion_tokens ?? 0,
                        total: response.usage?.total_tokens ?? 0
                    }
                },
                diagnostics: { outcome: 'success' }
            }
        } catch (error) {
            const diag = this.extractDiagnostics(error)

            // Check for timeout (AbortError)
            if (diag.errorName === 'AbortError') {
                return {
                    result: null,
                    diagnostics: {
                        outcome: 'timeout',
                        errorName: diag.errorName,
                        errorCode: diag.errorCode,
                        errorType: diag.errorType,
                        httpStatus: diag.httpStatus
                    }
                }
            }

            return {
                result: null,
                diagnostics: {
                    outcome: 'error',
                    errorName: diag.errorName,
                    errorCode: diag.errorCode,
                    errorType: diag.errorType,
                    httpStatus: diag.httpStatus,
                    errorMessage: diag.errorMessage
                }
            }
        } finally {
            clearTimeout(timeoutHandle)
        }
    }

    private async generateLegacy(options: OpenAIGenerateOptions): Promise<OpenAIGenerateResult | null> {
        // Preserve the historical behavior: return null on any error.
        try {
            const { result } = await this.generateWithDiagnostics(options)
            return result
        } catch {
            return null
        }
    }

    // Extract a bounded set of diagnostics from OpenAI/Azure SDK errors.
    // NOTE: We intentionally avoid attaching request IDs here to keep cardinality low.
    private extractDiagnostics(error: unknown): {
        httpStatus?: number
        errorCode?: string
        errorType?: string
        errorName?: string
        errorMessage?: string
    } {
        const anyErr = error as Record<string, unknown> | null
        const errorName =
            error instanceof Error ? error.name : typeof anyErr?.['name'] === 'string' ? (anyErr['name'] as string) : undefined
        const errorMessage =
            error instanceof Error ? error.message : typeof anyErr?.['message'] === 'string' ? (anyErr['message'] as string) : undefined

        const httpStatusRaw = anyErr && typeof anyErr['status'] === 'number' ? (anyErr['status'] as number) : undefined
        const httpStatus = typeof httpStatusRaw === 'number' && Number.isFinite(httpStatusRaw) ? httpStatusRaw : undefined

        // OpenAI SDK errors often include code/type fields.
        const errorCode = anyErr && typeof anyErr['code'] === 'string' ? (anyErr['code'] as string) : undefined
        const errorType = anyErr && typeof anyErr['type'] === 'string' ? (anyErr['type'] as string) : undefined

        return { httpStatus, errorCode, errorType, errorName, errorMessage }
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Attempt a minimal completion to verify connectivity
            const response = await this.client.completions.create({
                prompt: 'test',
                model: this.config.model,
                max_tokens: 1
            })
            return response.choices && response.choices.length > 0
        } catch {
            return false
        }
    }
}
