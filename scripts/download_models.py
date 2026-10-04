"""Fetch pinned browser translation model assets into public/models.

The shared OPUS model covers seven selectable languages. Bislama and Swahili
are exported separately by scripts/export_marian.py.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = ROOT / "public" / "models"
REVISION = {
    "Xenova/opus-mt-en-id": "b3b41f654c2fb3286d007dee1da7b0f47fd27d82",
    "Xenova/opus-mt-en-mul": "e57f9759f8e1e9ed97067bfc11e53e1eab63e57e",
    "Xenova/opus-mt-id-en": "c38ef36c843b71177da903442835c3c870975fd6",
}
SPEECH_MODEL = "onnx-community/whisper-tiny"
SPEECH_REVISION = "ff4177021cc41f7db950912b73ea4fdf7d01d8e7"
FILES = [
    "config.json",
    "generation_config.json",
    "source.spm",
    "target.spm",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "onnx/encoder_model_quantized.onnx",
    "onnx/decoder_model_merged_quantized.onnx",
]
SPEECH_FILES = [
    "added_tokens.json",
    "config.json",
    "generation_config.json",
    "merges.txt",
    "normalizer.json",
    "preprocessor_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "onnx/encoder_model_quantized.onnx",
    "onnx/decoder_model_merged_quantized.onnx",
]


def download(model: str, revision: str, name: str) -> dict[str, object]:
    destination = MODEL_ROOT / model / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists() or destination.stat().st_size == 0:
        url = f"https://huggingface.co/{model}/resolve/{revision}/{name}"
        request = urllib.request.Request(url, headers={"User-Agent": "LokalPingu/0.1"})
        temporary = destination.with_name(destination.name + ".part")
        print(f"Downloading {model}/{name}", flush=True)
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        temporary.replace(destination)
    digest = hashlib.sha256()
    with destination.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"file": name, "bytes": destination.stat().st_size, "sha256": digest.hexdigest()}


def main() -> None:
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    for model, revision in REVISION.items():
        assets = [download(model, revision, name) for name in FILES]
        manifest = {"model": model, "revision": revision, "source": f"https://huggingface.co/{model}", "license": "Apache-2.0 (upstream Helsinki-NLP model)", "assets": assets}
        (MODEL_ROOT / model / "lokalpingu-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    speech_assets = [download(SPEECH_MODEL, SPEECH_REVISION, name) for name in SPEECH_FILES]
    speech_manifest = {
        "model": SPEECH_MODEL,
        "revision": SPEECH_REVISION,
        "source": f"https://huggingface.co/{SPEECH_MODEL}",
        "upstream": "https://huggingface.co/openai/whisper-tiny",
        "license": "MIT (OpenAI Whisper)",
        "assets": speech_assets,
    }
    (MODEL_ROOT / SPEECH_MODEL / "lokalpingu-manifest.json").write_text(json.dumps(speech_manifest, indent=2), encoding="utf-8")
    print("Translation and speech models ready. Vite bundles the WASM runtime.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Download failed: {error}", file=sys.stderr)
        raise
