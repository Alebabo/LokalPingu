import { env, pipeline } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/whisper-tiny';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = true;

type SpeechOutput = { text: string };
type Transcriber = (audio: Float32Array, options: { language?: string; task: 'transcribe' }) => Promise<SpeechOutput | SpeechOutput[]>;
const createSpeechPipeline = pipeline as unknown as (
  task: 'automatic-speech-recognition',
  model: string,
  options: object,
) => Promise<Transcriber>;
let transcriber: Transcriber | null = null;

async function getTranscriber(requestId: number): Promise<Transcriber> {
  if (transcriber) return transcriber;
  transcriber = await createSpeechPipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (progress: { status: string; file?: string; progress?: number }) => {
      if (progress.status === 'progress') {
        self.postMessage({ requestId, type: 'progress', file: progress.file, progress: progress.progress });
      }
    },
  });
  return transcriber;
}

interface WorkerRequest {
  requestId: number;
  type: 'install' | 'transcribe';
  audio?: Float32Array;
  language?: string;
}

async function processRequest({ requestId, type, audio, language }: WorkerRequest) {
  try {
    const pipe = await getTranscriber(requestId);
    if (type === 'install') {
      self.postMessage({ requestId, type: 'done', result: true });
      return;
    }
    if (!audio?.length) throw new Error('No audio was recorded.');
    const result = await pipe(audio, {
      ...(language ? { language } : {}),
      task: 'transcribe',
    });
    const first = Array.isArray(result) ? result[0] : result;
    const text = first?.text?.trim() ?? '';
    if (!text) throw new Error('No speech detected. Try again closer to the microphone.');
    self.postMessage({ requestId, type: 'done', result: text });
  } catch (error) {
    self.postMessage({ requestId, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => processRequest(event.data));
};
