import VoiceRecorderTranscriber from '../components/voice-recorder-transcriber';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-white to-gray-100">
      <div className="flex flex-col items-center w-full max-w-md">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold text-gray-800">Voice Transcription App</h1>
          <p className="text-lg text-gray-600">Record and transcribe your voice with ease</p>
        </div>
        <VoiceRecorderTranscriber />
      </div>
    </main>
  );
}
