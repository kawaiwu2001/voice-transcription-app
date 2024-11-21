'use client'

import { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Alert } from './ui/alert'

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const MAX_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export default function VoiceRecorderTranscriber() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [transcription, setTranscription] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const [retryCount, setRetryCount] = useState(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      chunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        chunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setError(null)
    } catch (err) {
      setError('Please allow microphone access to record audio.')
      console.error('Error accessing microphone:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleTranscribe = async () => {
    if (!audioBlob) return;

    setIsTranscribing(true);
    setError(null);
    setRetryCount(0);

    const attemptTranscription = async (attempt) => {
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob);

        console.log(`Transcription attempt ${attempt + 1}/${MAX_RETRIES}`);

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
          // Increase timeout to 2 minutes
          signal: AbortSignal.timeout(120000) // 2 minute timeout
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Transcription failed');
        }

        setTranscription(data.text);
        console.log('Transcription completed successfully');

      } catch (err) {
        console.error('Transcription error:', err);

        if (err.name === 'AbortError') {
          throw new Error('Request timed out. Try with a shorter recording.');
        }

        if (attempt < MAX_RETRIES - 1 &&
          (err.message.includes('ECONNRESET') ||
            err.message.includes('timeout') ||
            err.message.includes('503'))) {
          console.log(`Retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1))); // Exponential backoff
          setRetryCount(attempt + 1);
          return attemptTranscription(attempt + 1);
        }

        throw err;
      }
    };

    try {
      await attemptTranscription(0);
    } catch (err) {
      setError(`Failed to transcribe audio: ${err.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Helper function to compress audio if needed
  const compressAudioIfNeeded = async (blob) => {
    // If blob is small enough, return as is
    if (blob.size <= MAX_CHUNK_SIZE) {
      return blob;
    }

    // Here you could add audio compression logic if needed
    // For now, we're just returning the original blob
    return blob;
  };

  const handleDownload = () => {
    if (!transcription) return

    const blob = new Blob([transcription], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transcription.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const testConnection = async () => {
    try {
      setError(null);
      const response = await fetch('/api/test');
      const data = await response.json();

      if (data.status === 'error') {
        setError(`Connection test failed: ${data.error}`);
      } else {
        setError(`Connection test passed! Whisper ${data.tests.whisperAvailable ? 'is' : 'is not'} available.`);
      }
    } catch (err) {
      setError(`Connection test failed: ${err.message}`);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Voice Recorder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            {error}
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </Button>

          {audioBlob && !isRecording && (
            <Button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              variant="secondary"
            >
              {isTranscribing ? 'Transcribing...' : 'Transcribe'}
            </Button>
          )}
        </div>

        {audioBlob && !isRecording && (
          <div className="mt-4">
            <audio controls src={URL.createObjectURL(audioBlob)} />
          </div>
        )}

        {transcription && (
          <div className="mt-4 space-y-2">
            <div className="rounded-lg border p-4 bg-secondary">
              <h3 className="font-semibold mb-2">Transcription:</h3>
              <p className="whitespace-pre-wrap">{transcription}</p>
            </div>
            <Button onClick={handleDownload} variant="outline">
              Download Transcription
            </Button>
          </div>
        )}

        {retryCount > 0 && isTranscribing && (
          <Alert className="mt-2">
            Retry attempt {retryCount}/{MAX_RETRIES}...
          </Alert>
        )}

        <Button
          onClick={testConnection}
          variant="outline"
          className="mt-2"
        >
          Test Connection
        </Button>
      </CardContent>
    </Card>
  )
}