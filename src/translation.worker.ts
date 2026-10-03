import { env, pipeline } from '@huggingface/transformers';
import { languages, modelId, outboundModelId, type LanguageCode } from './languages';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = true;

type Translator = Awaited<ReturnType<typeof pipeline<'translation'>>>;
let loaded: { id: string; translator: Translator } | null = null;

async function getTranslator(id: string, requestId: number): Promise<Translator> {
  if (loaded?.id === id) return loaded.translator;
  if (loaded) {
    await loaded.translator.dispose();
    loaded = null;
  }
  const translator = await pipeline('translation', id, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (progress) => {
      if (progress.status === 'progress') {
        self.postMessage({ requestId, type: 'progress', file: progress.file, progress: progress.progress });
      }
    }
  });
  loaded = { id, translator };
  return translator;
}

async function translate(code: LanguageCode, text: string, requestId: number, direction: 'fromEnglish' | 'toEnglish'): Promise<string> {
  if (text.length > 600) throw new Error('Use shorter messages (up to 600 characters).');
  const model = direction === 'toEnglish' ? outboundModelId(code) : modelId(code);
  const translator = await getTranslator(model, requestId);
  const language = languages.find((item) => item.code === code);
  if (!language) throw new Error('Unknown language');
  const segments = text.match(/[^.!?]+[.!?]?/gu)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  const output: string[] = [];
  for (const segment of segments) {
    const input = direction === 'fromEnglish' && model === 'Xenova/opus-mt-en-mul' && language.opusTag ? `>>${language.opusTag}<< ${segment}` : segment;
    const result = await translator(input);
    const first = Array.isArray(result) ? result[0] : result;
    output.push((first as { translation_text: string }).translation_text);
  }
  return output.join(' ');
}

interface WorkerRequest {
  requestId: number;
  type: 'install' | 'translate';
  code: LanguageCode;
  text?: string;
  direction?: 'fromEnglish' | 'toEnglish';
}

async function processRequest({ requestId, type, code, text, direction = 'fromEnglish' }: WorkerRequest) {
  try {
    if (type === 'install') {
      await translate(code, direction === 'toEnglish' ? 'Selamat datang' : 'Where is your business?', requestId, direction);
      self.postMessage({ requestId, type: 'done', result: true });
    } else if (text) {
      const result = await translate(code, text, requestId, direction);
      self.postMessage({ requestId, type: 'done', result });
    } else throw new Error('Missing translation input');
  } catch (error) {
    self.postMessage({ requestId, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => processRequest(event.data));
};

