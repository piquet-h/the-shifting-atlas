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
        const { prompt, maxTokens = 500, temperature = 0.7, timeoutMs = 30000 } = options

        try {
            // Create abort controller for timeout
            const controller = new AbortController()
            const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

            try {
                const response = await this.client.completions.create(
                    {
                        prompt,
                        model: this.config.model,
                        max_tokens: maxTokens,
                        temperature
                    },
                    { signal: controller.signal }
                )

                clearTimeout(timeoutHandle)

                if (!response.choices || response.choices.length === 0) {
                    return null
                }

                const content = (response.choices[0].text || '').trim()
                if (!content) {
                    return null
                }

                return {
                    content,
                    tokenUsage: {
                        prompt: response.usage?.prompt_tokens ?? 0,
                        completion: response.usage?.completion_tokens ?? 0,
                        total: response.usage?.total_tokens ?? 0
                    }
                }
            } catch (error) {
                clearTimeout(timeoutHandle)

                // Check for timeout (AbortError)
                if (error instanceof Error && error.name === 'AbortError') {
                    return null
                }

                // Re-throw to be caught by outer try-catch
                throw error
            }
        } catch (error) {
            // Log error for debugging but don't throw - caller will handle null gracefully
            if (error instanceof Error) {
                console.error('OpenAI generation error:', error.message)
            }
            return null
        }
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
