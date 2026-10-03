const MODEL_ID = 'onnx-community/whisper-tiny';
const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

const worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, Pending>();
let requestId = 0;

worker.onmessage = (event: MessageEvent<{ requestId: number; type: 'progress' | 'done' | 'error'; result?: unknown; error?: string }>) => {
  const message = event.data;
  if (message.type === 'progress') return;
  const job = pending.get(message.requestId);
  if (!job) return;
  pending.delete(message.requestId);
  if (message.type === 'error') job.reject(new Error(message.error ?? 'Speech recognition failed.'));
  else job.resolve(message.result);
};

function request(type: 'install' | 'transcribe', audio?: Float32Array, language?: string): Promise<unknown> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (audio) worker.postMessage({ requestId: id, type, audio, language }, [audio.buffer]);
    else worker.postMessage({ requestId: id, type, language });
  });
}

export function installSpeechModel(): Promise<void> {
  return request('install').then(() => undefined);
}

export function transcribeAudio(audio: Float32Array, language?: string): Promise<string> {
  return request('transcribe', audio, language).then(String);
}

export async function hasSpeechModel(): Promise<boolean> {
  if (!('caches' in window)) return false;
  for (const file of MODEL_FILES) {
    if (!(await caches.match(`/models/${MODEL_ID}/${file}`))) return false;
  }
  return true;
}

export async function decodeRecordedAudio(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const sourceLength = buffer.length;
    const mono = new Float32Array(sourceLength);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < sourceLength; index += 1) mono[index] += data[index]! / buffer.numberOfChannels;
    }
    if (buffer.sampleRate === 16_000) return mono;
    const targetLength = Math.max(1, Math.round(sourceLength * 16_000 / buffer.sampleRate));
    const output = new Float32Array(targetLength);
    const ratio = buffer.sampleRate / 16_000;
    for (let index = 0; index < targetLength; index += 1) {
      const position = index * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, sourceLength - 1);
      const fraction = position - left;
      output[index] = mono[left]! * (1 - fraction) + mono[right]! * fraction;
    }
    return output;
  } finally {
    await context.close();
  }
}
