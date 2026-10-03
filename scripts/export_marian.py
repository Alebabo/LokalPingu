"""Prepare quantized browser models from exported Helsinki-NLP models.

Run the `optimum-cli export onnx` commands shown in README first.
Requires onnxruntime and sentencepiece in the model virtual environment.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

import sentencepiece as spm
from onnxruntime.quantization import QuantType, quantize_dynamic

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "public/models/Xenova/opus-mt-en-mul/tokenizer.json"


def tokenizer_json(source: Path) -> dict:
    """Mirror the shared Marian browser tokenizer's merged vocabulary format."""
    template = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    vocabulary: dict[str, int] = json.loads((source / "vocab.json").read_text(encoding="utf-8"))
    by_id = sorted(vocabulary.items(), key=lambda item: item[1])
    assert [index for _, index in by_id] == list(range(len(by_id)))
    source_spm = spm.SentencePieceProcessor(model_file=str(source / "source.spm"))
    target_spm = spm.SentencePieceProcessor(model_file=str(source / "target.spm"))
    entries = []
    for token, _ in by_id:
        scores = []
        for model in (source_spm, target_spm):
            index = model.piece_to_id(token)
            if index >= 0 and model.id_to_piece(index) == token:
                scores.append(float(model.get_score(index)))
        entries.append([token, 0.0 if token == '<pad>' else max(scores) if scores else -100.0])
    template["model"]["vocab"] = entries
    template["model"]["unk_id"] = vocabulary["<unk>"]
    template["added_tokens"] = [
        {"id": vocabulary[token], "special": True, "content": token, "single_word": False,
         "lstrip": False, "rstrip": False, "normalized": False}
        for token in ("</s>", "<unk>", "<pad>")
    ]
    template["post_processor"]["special_tokens"]["</s>"]["ids"] = [vocabulary["</s>"]]
    return template


def prepare(pair: str) -> None:
    source = ROOT / ".cache" / f"{pair}-export"
    destination = ROOT / "public" / "models" / "LokalPingu" / f"opus-mt-{pair}"
    onnx = destination / "onnx"
    onnx.mkdir(parents=True, exist_ok=True)
    for name in ("config.json", "generation_config.json", "source.spm", "target.spm", "tokenizer_config.json", "vocab.json", "special_tokens_map.json"):
        shutil.copy2(source / name, destination / name)
    (destination / "tokenizer.json").write_text(json.dumps(tokenizer_json(source), ensure_ascii=False), encoding="utf-8")
    for prefix in ("encoder_model", "decoder_model_merged"):
        print(f"Quantizing {pair}/{prefix}", flush=True)
        quantize_dynamic(source / f"{prefix}.onnx", onnx / f"{prefix}_quantized.onnx",
                         weight_type=QuantType.QInt8, extra_options={"EnableSubgraph": True})
    assets = []
    for path in destination.rglob("*"):
        if path.is_file() and path.name != "lokalpingu-manifest.json":
            assets.append({"file": path.relative_to(destination).as_posix(), "bytes": path.stat().st_size,
                           "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    manifest = {"model": f"Helsinki-NLP/opus-mt-{pair}", "source": f"https://huggingface.co/Helsinki-NLP/opus-mt-{pair}",
                "license": "Apache-2.0", "conversion": "Optimum ONNX export plus ONNX Runtime dynamic int8 quantization",
                "assets": assets}
    (destination / "lokalpingu-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    pairs = sys.argv[1:] or ["en-bi", "bi-en", "en-sw"]
    for pair in pairs:
        prepare(pair)
    print(f"Browser models ready: {', '.join(pairs)}")
