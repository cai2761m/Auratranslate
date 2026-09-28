"""Encode browser-captured PNG sequences. Requires Python 3 and Pillow."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
for name, output in [("immersive", "immersive-demo.gif"), ("aurora", "aurora-demo.gif")]:
    folder = ROOT / "node_modules/.cache/readme-frames" / name
    sequence = json.loads((folder / "sequence.json").read_text())
    frames = [Image.open(folder / f"{i:03d}.png").convert("RGB") for i in range(sequence["count"])]
    # One shared palette keeps flat UI surfaces and text steady between frames.
    samples = frames[::max(1, len(frames) // 12)]
    sheet = Image.new("RGB", (frames[0].width, frames[0].height * len(samples)))
    for index, frame in enumerate(samples):
        sheet.paste(frame, (0, index * frame.height))
    palette = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    destination = ROOT / "docs/assets" / output
    quantized[0].save(destination, save_all=True, append_images=quantized[1:], duration=sequence["duration"], loop=0, optimize=True, disposal=1)
    with Image.open(destination) as result:
        assert result.n_frames > 1
        assert result.info.get("loop") == 0
        duration = sum((result.seek(i), result.info.get("duration", 0))[1] for i in range(result.n_frames))
        print(f"{output}: {result.size}, {result.n_frames} frames, {duration}ms, {destination.stat().st_size / 1024:.0f} KiB")
