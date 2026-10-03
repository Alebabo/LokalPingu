"""Package the built PWA and locally downloaded model assets."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
MODELS = DIST / "models"
OUTPUT = ROOT / "release" / "LokalPingu-offline-MVP.zip"


def main() -> None:
    if not (DIST / "index.html").is_file() or not MODELS.is_dir():
        raise SystemExit("Run npm run models, export custom models, then npm run build first.")
    expected = [
        "Xenova/opus-mt-en-id", "Xenova/opus-mt-en-mul",
        "Xenova/opus-mt-id-en", "Xenova/opus-mt-mul-en",
        "LokalPingu/opus-mt-en-bi",
        "LokalPingu/opus-mt-bi-en",
        "LokalPingu/opus-mt-en-sw",
        "onnx-community/whisper-tiny",
    ]
    for model in expected:
        if not (MODELS / model / "onnx/decoder_model_merged_quantized.onnx").is_file():
            raise SystemExit(f"Missing model: {model}")
    OUTPUT.parent.mkdir(exist_ok=True)
    with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=3, allowZip64=True) as archive:
        for file in sorted(DIST.rglob("*")):
            if file.is_file():
                archive.write(file, file.relative_to(ROOT).as_posix())
        for name in ("serve_release.py", "README.md", "LICENSE-APACHE-2.0.txt"):
            archive.write(ROOT / name, name)
    print(f"{OUTPUT} ({OUTPUT.stat().st_size / 2**20:.1f} MiB)")


if __name__ == "__main__":
    main()
