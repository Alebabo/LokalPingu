import { env, pipeline } from '@huggingface/transformers';
import wasmUrl from '../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url';

const MODEL_ID = 'onnx-community/whisper-tiny';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = true;
env.backends.onnx.wasm!.wasmPaths = { wasm: new URL(wasmUrl, self.location.origin).href };

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

function hasAudibleSpeech(audio: Float32Array): boolean {
  const frameSize = 320; // 20 ms at 16 kHz
  const levels: number[] = [];
  for (let offset = 0; offset + frameSize <= audio.length; offset += frameSize) {
    let power = 0;
    for (let index = offset; index < offset + frameSize; index += 1) {
      const sample = audio[index]!;
      if (!Number.isFinite(sample)) return false;
      power += sample * sample;
    }
    levels.push(Math.sqrt(power / frameSize));
  }
  if (!levels.length) return false;
  const sorted = [...levels].sort((left, right) => left - right);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.2)]!;
  const speechLevel = Math.max(0.003, noiseFloor * 3);
  return levels.filter((level) => level > speechLevel).length >= 10;
}

async function processRequest({ requestId, type, audio, language }: WorkerRequest) {
  try {
    if (type === 'install') {
      await getTranscriber(requestId);
      self.postMessage({ requestId, type: 'done', result: true });
      return;
    }
    if (!audio?.length) throw new Error('No audio was recorded.');
    if (audio.length < 16_000) throw new Error('Recording was too short. Speak for at least one second.');
    if (!hasAudibleSpeech(audio)) throw new Error('No audible speech detected. Check your microphone and try again.');
    const pipe = await getTranscriber(requestId);
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
