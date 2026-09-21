import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image, ImageDraw

from renderer.studio_render import assemble_picture, render_part


def portrait(path: Path, color: tuple[int, int, int], label: str) -> None:
    image = Image.new("RGB", (480, 640), color)
    draw = ImageDraw.Draw(image)
    draw.ellipse((90, 70, 390, 420), fill=(210, 176, 150))
    draw.ellipse((170, 180, 220, 230), fill=(40, 32, 28))
    draw.ellipse((260, 180, 310, 230), fill=(40, 32, 28))
    draw.arc((170, 280, 320, 360), 20, 160, fill=(90, 50, 50), width=4)
    draw.text((40, 560), label, fill=(20, 16, 12))
    image.save(path)


class RenderTests(unittest.TestCase):
    def test_reel_and_picture(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            maya = root / "maya.png"
            jonah = root / "jonah.png"
            portrait(maya, (28, 36, 58), "Maya")
            portrait(jonah, (42, 28, 24), "Jonah")
            part_one = root / "reel-1.mp4"
            part_two = root / "reel-2.mp4"
            render_part({
                "title": "Gate Test",
                "out": str(part_one),
                "shots": [
                    {"type": "slate", "duration": 1.2, "heading": "REEL 1 OF 2", "sub": "Gate Test"},
                    {
                        "type": "dialogue",
                        "duration": 1.4,
                        "heading": "INT. ARCHIVE - NIGHT",
                        "character": "MAYA",
                        "actor": "Maya Chen",
                        "line": "The reel is dated tomorrow.",
                        "photo": str(maya),
                        "timeOfDay": "NIGHT",
                    },
                ],
            })
            render_part({
                "title": "Gate Test",
                "out": str(part_two),
                "shots": [
                    {
                        "type": "dialogue",
                        "duration": 1.3,
                        "heading": "EXT. ROOF - DAWN",
                        "character": "JONAH",
                        "actor": "Jonah Adler",
                        "line": "Then we watch it before dawn.",
                        "photo": str(jonah),
                        "timeOfDay": "DAWN",
                    },
                ],
            })
            movie = root / "movie.mp4"
            assemble_picture({
                "title": "Gate Test",
                "logline": "An archivist has until dawn.",
                "out": str(movie),
                "parts": [str(part_one), str(part_two)],
                "cast": [
                    {"character": "MAYA", "actor": "Maya Chen"},
                    {"character": "JONAH", "actor": "Jonah Adler"},
                ],
            })
            self.assertGreater(probe(movie), probe(part_one) + probe(part_two))

    def test_refuses_dialogue_without_a_portrait(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            out = Path(raw) / "nope.mp4"
            with self.assertRaises(SystemExit):
                render_part({
                    "out": str(out),
                    "shots": [{"type": "dialogue", "duration": 1, "character": "MAYA", "line": "No."}],
                })


def probe(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


if __name__ == "__main__":
    unittest.main()
