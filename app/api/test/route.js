import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// Initialize OpenAI with the same configuration as your transcribe route
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000,
    maxRetries: 3,
    httpAgent: new (require('https').Agent)({
        keepAlive: true,
        timeout: 60000,
    })
});

export async function GET() {
    try {
        console.log('Starting OpenAI connection test...')

        // Test 1: Check API Key
        console.log('Test 1: Checking API Key...')
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key is missing')
        }
        console.log('✓ API Key is present')

        // Test 2: List Models (Basic API Connection Test)
        console.log('Test 2: Testing basic API connection...')
        const models = await openai.models.list()
        console.log('✓ Successfully connected to OpenAI')
        console.log('Available models:', models.data.map(model => model.id))

        // Test 3: Check for Whisper Model Access
        console.log('Test 3: Checking Whisper model access...')
        const whisperModel = models.data.find(model => model.id === 'whisper-1')
        if (!whisperModel) {
            console.warn('⚠ Whisper model not found in available models')
        } else {
            console.log('✓ Whisper model is available')
        }

        // Test 4: Check Rate Limits
        console.log('Test 4: Checking rate limits...')
        const headers = models.response?.headers
        if (headers) {
            console.log('Rate limit info:', {
                'x-ratelimit-limit-requests': headers['x-ratelimit-limit-requests'],
                'x-ratelimit-remaining-requests': headers['x-ratelimit-remaining-requests'],
                'x-ratelimit-reset-requests': headers['x-ratelimit-reset-requests']
            })
        }

        return NextResponse.json({
            status: 'success',
            tests: {
                apiKey: true,
                connection: true,
                whisperAvailable: !!whisperModel,
                models: models.data.map(model => model.id)
            },
            message: 'All connection tests passed successfully'
        })

    } catch (error) {
        console.error('OpenAI Connection Test Error:', {
            message: error.message,
            type: error.type,
            status: error.status,
            stack: error.stack
        })

        // Determine the specific error type
        let errorMessage = 'Unknown error occurred'
        let statusCode = 500

        if (error.message.includes('API key')) {
            errorMessage = 'Invalid or missing API key'
            statusCode = 401
        } else if (error.message.includes('ECONNRESET')) {
            errorMessage = 'Connection reset by server'
            statusCode = 503
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Connection timed out'
            statusCode = 504
        }

        return NextResponse.json({
            status: 'error',
            error: errorMessage,
            details: error.message,
            type: error.type,
            code: statusCode
        }, { status: statusCode })
    }
} 