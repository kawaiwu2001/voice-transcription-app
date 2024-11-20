import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Initialize OpenAI with increased timeout
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 120000, // 2 minutes
    maxRetries: 5,
    httpAgent: new (require('https').Agent)({
        keepAlive: true,
        timeout: 120000,
    })
});

export async function POST(request) {
    console.log('Transcription request received');
    let tempFilePath = null;
    let fileStream = null;

    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio');

        if (!audioFile) {
            console.error('No audio file provided');
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        console.log('Audio file received:', {
            type: audioFile.type,
            size: audioFile.size,
        });

        // Validate file size (OpenAI limit is 25MB)
        const MAX_FILE_SIZE = 25 * 1024 * 1024;
        if (audioFile.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'File too large', details: 'Audio file must be less than 25MB' },
                { status: 400 }
            );
        }

        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `audio-${Date.now()}.mp3`);

        const bytes = await audioFile.arrayBuffer();
        const buffer = Buffer.from(bytes);

        fs.writeFileSync(tempFilePath, buffer);
        console.log('File saved:', tempFilePath);

        fileStream = fs.createReadStream(tempFilePath);

        console.log('Starting transcription with OpenAI Whisper');

        const transcription = await retryOnFailure(async () => {
            return openai.audio.transcriptions.create({
                file: fileStream,
                model: 'whisper-1',
                language: 'en',
                response_format: 'text',
                temperature: 0.2,
            });
        }, 3, 2000); // 3 retries with 2s delay

        console.log('Transcription successful');
        fileStream.destroy();

        return NextResponse.json({ text: transcription });
    } catch (error) {
        console.error('Server error:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause,
        });

        if (fileStream) fileStream.destroy();
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                await fs.promises.unlink(tempFilePath);
                console.log('Temporary file cleaned up after error');
            } catch (cleanupError) {
                console.error('Failed to clean up temporary file:', cleanupError);
            }
        }

        if (error.message.includes('ECONNRESET') || error.message.includes('timeout')) {
            return NextResponse.json(
                { error: 'Connection timeout. Please try with a shorter audio clip.', details: error.message },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to process audio', details: error.message },
            { status: 500 }
        );
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            await fs.promises.unlink(tempFilePath).catch(console.error);
        }
    }
}

// Helper function for retry logic
async function retryOnFailure(fn, retries, delay) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`Retrying due to error: ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
