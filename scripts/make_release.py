"""Package the built PWA and locally downloaded model assets."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
MODELS = DIST / "models"
RELEASE = ROOT / "release" / "LokalPingu-offline-MVP"
OUTPUT = RELEASE.with_suffix(".zip")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder-only", action="store_true", help="Create the runnable folder without a ZIP")
    args = parser.parse_args()
    if not (DIST / "index.html").is_file() or not MODELS.is_dir():
        raise SystemExit("Run npm run models, export custom models, then npm run build first.")
    expected = [
        "Xenova/opus-mt-en-id", "Xenova/opus-mt-en-mul",
        "Xenova/opus-mt-id-en",
        "LokalPingu/opus-mt-en-bi",
        "LokalPingu/opus-mt-en-sw",
        "onnx-community/whisper-tiny",
    ]
    for model in expected:
        model_root = MODELS / model
        if not (model_root / "onnx/decoder_model_merged_quantized.onnx").is_file():
            raise SystemExit(f"Missing model: {model}")
        manifest = json.loads((model_root / "lokalpingu-manifest.json").read_text(encoding="utf-8"))
        for asset in manifest["assets"]:
            file = model_root / asset["file"]
            if not file.is_file() or file.stat().st_size != asset["bytes"]:
                raise SystemExit(f"Missing or incomplete model asset: {file}")
            digest = hashlib.sha256()
            with file.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != asset["sha256"]:
                raise SystemExit(f"Model checksum mismatch: {file}")
    if not list((DIST / "assets").glob("*.wasm")):
        raise SystemExit("Missing local WASM runtime")

    release_root = RELEASE.parent.resolve()
    if not release_root.is_relative_to(ROOT.resolve()) or RELEASE.resolve().parent != release_root:
        raise SystemExit("Unsafe release directory")
    RELEASE.parent.mkdir(exist_ok=True)
    if RELEASE.exists():
        shutil.rmtree(RELEASE)
    RELEASE.mkdir()
    shutil.copytree(DIST, RELEASE / "dist", ignore=shutil.ignore_patterns("opus-mt-mul-en", "opus-mt-bi-en"))
    for name in ("Start-LokalPingu.cmd", "serve_offline.ps1"):
        shutil.copy2(ROOT / "scripts" / name, RELEASE / name)
    for name in ("serve_release.py", "README.md", "LICENSE-APACHE-2.0.txt"):
        shutil.copy2(ROOT / name, RELEASE / name)
    print(f"Ready: {RELEASE}")

    if not args.folder_only:
        with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=3, allowZip64=True) as archive:
            for file in sorted(RELEASE.rglob("*")):
                if file.is_file():
                    archive.write(file, file.relative_to(RELEASE).as_posix())
        print(f"{OUTPUT} ({OUTPUT.stat().st_size / 2**20:.1f} MiB)")


if __name__ == "__main__":
    main()
