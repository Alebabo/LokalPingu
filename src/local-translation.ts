import { modelId, outboundModelId, supportsReverseTranslation, type LanguageCode } from './languages';

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

const worker = new Worker(new URL('./translation.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, Pending>();
let requestId = 0;

function rejectPending(message: string) {
  const error = new Error(message);
  for (const job of pending.values()) job.reject(error);
  pending.clear();
}

worker.onmessage = (event: MessageEvent<{ requestId: number; type: 'progress' | 'done' | 'error'; result?: unknown; error?: string }>) => {
  const message = event.data;
  if (message.type === 'progress') return;
  const job = pending.get(message.requestId);
  if (!job) return;
  pending.delete(message.requestId);
  if (message.type === 'error') job.reject(new Error(message.error ?? 'Translation failed.'));
  else job.resolve(message.result);
};
worker.onerror = () => rejectPending('Translation worker failed. Reload the app and try again.');
worker.onmessageerror = () => rejectPending('Translation worker returned unreadable data.');

function request(type: 'install' | 'translate', code: LanguageCode, text?: string, direction: 'fromEnglish' | 'toEnglish' = 'fromEnglish'): Promise<unknown> {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ requestId: id, type, code, text, direction });
  });
}

export function installLanguagePack(code: LanguageCode): Promise<void> {
  return request('install', code).then(() => undefined);
}

export function translateEnglish(code: LanguageCode, text: string): Promise<string> {
  return request('translate', code, text).then(String);
}

export function translateToEnglish(code: LanguageCode, text: string): Promise<string> {
  if (!supportsReverseTranslation(code)) return Promise.reject(new Error('Local-to-English translation is not verified for this language.'));
  return request('translate', code, text, 'toEnglish').then(String);
}

export function installReverseLanguagePack(code: LanguageCode): Promise<void> {
  if (!supportsReverseTranslation(code)) return Promise.reject(new Error('Local-to-English translation is not verified for this language.'));
  return request('install', code, undefined, 'toEnglish').then(() => undefined);
}

export async function hasLanguagePack(code: LanguageCode): Promise<boolean> {
  if (!('caches' in window)) return false;
  const id = modelId(code);
  const files = ['config.json', 'tokenizer.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
  for (const file of files) if (!(await caches.match(`/models/${id}/${file}`))) return false;
  return true;
}

export async function hasReverseLanguagePack(code: LanguageCode): Promise<boolean> {
  if (!supportsReverseTranslation(code)) return false;
  if (!('caches' in window)) return false;
  const id = outboundModelId(code);
  const files = ['config.json', 'tokenizer.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
  for (const file of files) if (!(await caches.match(`/models/${id}/${file}`))) return false;
  return true;
}
