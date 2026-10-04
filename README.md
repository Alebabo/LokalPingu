# LokalPingu MVP

LokalPingu is an installable, offline web app for a tourism operator to understand English customer messages and review replies grounded in business facts saved on the device. It never sends a message or confirms a booking automatically.

The active interface is `src/ZipFrontend.tsx`. The Translate tab switches between voice and text translation. Voice input records up to 30 seconds, transcribes locally with quantized multilingual Whisper Tiny, then uses the selected local translation model. Text translation supports English to every bundled local language through `src/translation.worker.ts`. Verified local-language-to-English translation is available for Bahasa Indonesia. Download each required model once; later inference stays on the device. Chat conversations are examples; sending a demo reply also copies it for use in a messaging app. The Business screen shows connector logos and their disconnected status. Live guest channels, local speech synthesis, Google sync and booking connectors are not connected.

## Run

```powershell
npm install
npm run models
npm run dev
```

Open `http://localhost:5173`. To test the installable build, run `npm run build` and `npm run preview`, then open `http://localhost:4173`. A PWA needs HTTPS or `localhost`; opening `index.html` through `file://` does not provide offline installation.

The repository ignores downloaded model binaries. `npm run models` fetches pinned, quantized English-to-local browser assets for Indonesian and the shared model used by Thai, Bangla, Hindi, Tamil, Vietnamese, Khmer and Nepali. It also fetches the pinned multilingual Whisper Tiny speech-recognition pack. Bislama and Kiswahili use separately converted models:

```powershell
python -m venv .venv-model
.\.venv-model\Scripts\python.exe -m pip install "optimum[onnxruntime]" sentencepiece "transformers<5"
.\.venv-model\Scripts\optimum-cli.exe export onnx -m Helsinki-NLP/opus-mt-en-bi --task text2text-generation-with-past .cache\en-bi-export
.\.venv-model\Scripts\optimum-cli.exe export onnx -m Helsinki-NLP/opus-mt-en-sw --task text2text-generation-with-past .cache\en-sw-export
.\.venv-model\Scripts\python.exe scripts\export_marian.py
```

Model files are served from the same origin. The app downloads only the required direction into the browser cache. Forward packs range from about 106 MiB to 135 MiB. Bahasa Indonesia has the only enabled local-language-to-English pack; other reverse models failed browser quality checks and are excluded from the release. These are current file sizes, not a transfer guarantee. PWA shell files are precached separately.

The Whisper Tiny q8 browser pack is 43.14 MiB. Microphone recordings are decoded and resampled to mono 16 kHz in the browser, sent to a local Web Worker, and discarded after transcription. Silent and very quiet recordings are rejected before inference, because Whisper Tiny can hallucinate words such as "you" on silence. No audio is uploaded or saved. Bislama is not a named Whisper language and therefore uses automatic language detection. Speech quality has not yet been validated on an entry-level Android phone or with tourism speakers.

For an offline Windows test, run `python scripts/make_release.py --folder-only` after building. It creates `release/LokalPingu-offline-MVP`. Double-click `Start-LokalPingu.cmd` in that folder. Each launch starts a fresh onboarding demo with the bundled Noor profile, four default products and four matching USD/TSh prices. Saved model files and browser model caches remain available. The local server opens `http://127.0.0.1:4173` and needs no internet or Python. Keep the command window open during the test. Model downloads in the app come from the bundled folder. For a ZIP of the same folder, run `python scripts/make_release.py` without `--folder-only`. After installing a language pack, the installed PWA also works without the server in the same browser profile.

## Business memory

The browser stores one owner-confirmed business profile, products and prices in IndexedDB. Previously saved interactions remain readable, but chat replies no longer save new interactions. Existing products and prices in the previous UI's localStorage are moved into IndexedDB on first load. Reply templates and free-text assistant questions read saved facts, offers and matching prices directly. Missing availability, dates and allergy handling require owner confirmation. Customer text never changes the profile. Unsupported prompts never dump the full business profile. The operator must approve and copy each reply. Settings can delete the profile, catalog and previously saved interactions.

No application server, account or cloud inference is used. Browser storage is not encrypted by LokalPingu; use test data for this MVP, especially on shared devices.

## Trained reply intent model

Guest reply drafting uses `LokalPingu Tourism Intent Mini v2`, a 218 KB multi-label text classifier trained locally in a second round on 19,800 synthetic English tourism enquiries. The second round adds character n-grams, indirect phrasing, multi-intent messages, typing errors and common chat abbreviations. The hackathon brief points to MASSIVE but contains no training records, so every generated example is marked synthetic in `data/synthetic/tourism-intents-v2.jsonl`. The trained weights live in `src/models/tourism-intent-model.ts` and run synchronously in the browser without network access.

The model only routes messages into eleven intents. Deterministic reply code remains the authority for owner-saved facts, prices, uncertainty and human confirmation. On the same 22-message hard free-text audit, v1 reached 0.28 micro-F1 and 0.36 exact match; v2 reached 0.84 micro-F1 and 0.77 exact match. The audit includes indirect phrasing, multi-intent requests, abbreviations, and out-of-domain text. It remains small and is not evidence of field performance.

Retrain with the existing Python 3.13 model environment:

```powershell
.\.venv-model\Scripts\python.exe scripts\train_tourism_intent_model_v2.py
npm test
npm run build
```

## Model sources and limits

- [Helsinki-NLP OPUS-MT English–Indonesian](https://huggingface.co/Helsinki-NLP/opus-mt-en-id), Apache-2.0; browser files from the `Xenova` conversion, pinned in `scripts/download_models.py`.
- [Helsinki-NLP OPUS-MT English–multiple](https://huggingface.co/Helsinki-NLP/opus-mt-en-mul), Apache-2.0; one shared model covers seven menu languages.
- [Helsinki-NLP English–Bislama](https://huggingface.co/Helsinki-NLP/opus-mt-en-bi), Apache-2.0; exported and dynamically quantized locally.
- [Helsinki-NLP English–Swahili](https://huggingface.co/Helsinki-NLP/opus-mt-en-sw), Apache-2.0; exported and dynamically quantized locally.
- [ONNX Community multilingual Whisper Tiny](https://huggingface.co/onnx-community/whisper-tiny), pinned q8 ONNX conversion of [OpenAI Whisper Tiny](https://huggingface.co/openai/whisper-tiny), MIT; 39 million parameters and 43.14 MiB of selected browser assets.

Translation quality is uneven. Browser tests rejected Bislama-to-English and Kiswahili-to-English because they changed the meaning of simple booking messages; those directions are disabled. The shared Nepali forward model repeated English in one test, and the English–Swahili model got one question wrong. The app flags unchanged output and keeps prices, times, numbers and saved English offer names visible. Allergy, price, time and booking details must still be checked against the original message. None of the forward languages has been validated with tourism speakers or on an entry-level phone. Transformers.js currently uses greedy decoding for these models, so published beam-search benchmark scores do not predict this browser prototype's quality.

## Verification

```powershell
npm test
npm run build
```

In the browser, install one language pack, enter a business profile, translate a customer message, review the draft, then switch the browser offline and reload the installed PWA. Confirm that translation and the saved profile still work.
