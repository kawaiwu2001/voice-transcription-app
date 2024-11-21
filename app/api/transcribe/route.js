import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

// Initialize OpenAI with increased timeout and retry settings
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 300000, // 5 minutes
    maxRetries: 5,
    httpAgent: new https.Agent({
        keepAlive: true,
        timeout: 300000,
    }),
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

        // Create temporary file with .webm extension
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `audio-${Date.now()}.webm`);

        // Convert Blob to Buffer and save
        const bytes = await audioFile.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Write file synchronously
        fs.writeFileSync(tempFilePath, buffer);
        console.log('File saved:', tempFilePath);

        // Verify file exists and is readable
        const stats = fs.statSync(tempFilePath);
        console.log('File stats:', {
            size: stats.size,
            path: tempFilePath,
            exists: fs.existsSync(tempFilePath)
        });

        // Create file stream
        fileStream = fs.createReadStream(tempFilePath);

        console.log('Starting transcription with OpenAI Whisper');
        const transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model: 'whisper-1',
            language: 'en',
            response_format: 'text',
            temperature: 0.2,
        });

        console.log('Transcription successful:', transcription);

        // Cleanup
        fileStream.destroy();
        fs.unlinkSync(tempFilePath);
        console.log('Temporary file cleaned up');

        return NextResponse.json({
            text: transcription,
        });
    } catch (error) {
        console.error('Server error:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause,
        });

        // Cleanup
        if (fileStream) {
            fileStream.destroy();
        }

        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                await fs.promises.unlink(tempFilePath);
                console.log('Temporary file cleaned up after error');
            } catch (cleanupError) {
                console.error('Failed to clean up temporary file:', cleanupError);
            }
        }

        if (
            error.message.includes('ECONNRESET') ||
            error.message.includes('timeout')
        ) {
            return NextResponse.json(
                {
                    error: 'Connection timeout. Please try with a shorter audio clip.',
                    details: error.message,
                },
                { status: 503 }
            );
        }

        return NextResponse.json(
            {
                error: 'Failed to process audio',
                details: error.message,
            },
            { status: 500 }
        );
    }
}
