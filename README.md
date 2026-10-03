# LokalPingu MVP

LokalPingu is an installable, offline web app for a tourism operator to understand English customer messages and review replies grounded in business facts saved on the device. It never sends a message or confirms a booking automatically.

The active interface is `src/ZipFrontend.tsx`. The Translate tab switches between voice and text translation. Voice input records up to 30 seconds, transcribes locally with quantized multilingual Whisper Tiny, then uses the selected local translation model. Text translation supports English to the selected local language and the selected local language to English through `src/translation.worker.ts`. Download each required model once; later inference stays on the device. Chat conversations are examples; sending a demo reply also copies it for use in a messaging app. The Business screen shows connector logos and their disconnected status. Live guest channels, local speech synthesis, Google sync and booking connectors are not connected.

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
.\.venv-model\Scripts\optimum-cli.exe export onnx -m Helsinki-NLP/opus-mt-bi-en --task text2text-generation-with-past .cache\bi-en-export
.\.venv-model\Scripts\optimum-cli.exe export onnx -m Helsinki-NLP/opus-mt-en-sw --task text2text-generation-with-past .cache\en-sw-export
.\.venv-model\Scripts\python.exe scripts\export_marian.py
```

Model files are served from the same origin. The app downloads only the required direction into the browser cache. Forward packs range from about 106 MiB to 135 MiB. Reverse packs use Indonesian-to-English, Bislama-to-English, or the shared multilingual-to-English model. These are current file sizes, not a transfer guarantee. PWA shell files are precached separately. Text translation works in both directions between English and the selected local language.

The Whisper Tiny q8 browser pack is 43.14 MiB. Microphone recordings are decoded and resampled to mono 16 kHz in the browser, sent to a local Web Worker, and discarded after transcription. No audio is uploaded or saved. Bislama is not a named Whisper language and therefore uses automatic language detection. Speech quality has not yet been validated on an entry-level Android phone or with tourism speakers.

For a portable download after building, run `python scripts/make_release.py`. It creates `release/LokalPingu-offline-MVP.zip`. Extract the ZIP, run `python serve_release.py`, visit `http://127.0.0.1:4173`, choose a language and install the PWA. The first language-pack download needs local access to the bundled server; after that, the installed app works offline in the same browser profile.

## Business memory

The browser stores one owner-confirmed business profile, products and prices in IndexedDB. Previously saved interactions remain readable, but chat replies no longer save new interactions. Existing products and prices in the previous UI's localStorage are moved into IndexedDB on first load. Reply templates read saved facts and matching prices directly. Missing availability, dates and allergy handling require owner confirmation. Customer text never changes the profile. The operator must approve and copy each reply. Settings can delete the profile, catalog and previously saved interactions.

No application server, account or cloud inference is used. Browser storage is not encrypted by LokalPingu; use test data for this MVP, especially on shared devices.

## Model sources and limits

- [Helsinki-NLP OPUS-MT English–Indonesian](https://huggingface.co/Helsinki-NLP/opus-mt-en-id), Apache-2.0; browser files from the `Xenova` conversion, pinned in `scripts/download_models.py`.
- [Helsinki-NLP OPUS-MT English–multiple](https://huggingface.co/Helsinki-NLP/opus-mt-en-mul), Apache-2.0; one shared model covers seven menu languages.
- [Helsinki-NLP English–Bislama](https://huggingface.co/Helsinki-NLP/opus-mt-en-bi), Apache-2.0; exported and dynamically quantized locally.
- [Helsinki-NLP English–Swahili](https://huggingface.co/Helsinki-NLP/opus-mt-en-sw), Apache-2.0; exported and dynamically quantized locally.
- [ONNX Community multilingual Whisper Tiny](https://huggingface.co/onnx-community/whisper-tiny), pinned q8 ONNX conversion of [OpenAI Whisper Tiny](https://huggingface.co/openai/whisper-tiny), MIT; 39 million parameters and 43.14 MiB of selected browser assets.

Translation quality is uneven. In browser smoke tests, the Bislama model mistranslated a peanut allergy, and the shared Nepali model repeated English rather than translating. The app flags an unchanged translation. The English–Swahili model produced Swahili but got one test question wrong. Allergy, price, time and booking details must be checked against the original message. None of the ten languages has been validated with tourism speakers or on an entry-level phone. Transformers.js currently uses greedy decoding for these models, so published beam-search benchmark scores do not predict this browser prototype's quality.

## Verification

```powershell
npm test
npm run build
```

In the browser, install one language pack, enter a business profile, translate a customer message, review the draft, then switch the browser offline and reload the installed PWA. Confirm that translation and the saved profile still work.
