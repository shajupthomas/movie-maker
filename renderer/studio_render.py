"""Render consented portrait reels and assemble them into a picture."""

from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

WIDTH = 1280
HEIGHT = 720
ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "public" / "fonts"

SERIF = str(FONT_DIR / "LiberationSerif-Regular.ttf")
SERIF_BOLD = str(FONT_DIR / "LiberationSerif-Bold.ttf")
SERIF_ITALIC = str(FONT_DIR / "LiberationSerif-Italic.ttf")
SANS = str(FONT_DIR / "LiberationSans-Regular.ttf")
SANS_BOLD = str(FONT_DIR / "LiberationSans-Bold.ttf")
MONO = str(FONT_DIR / "LiberationMono-Regular.ttf")

CREAM = (236, 228, 214)
MUTED = (176, 166, 150)
COPPER = (201, 134, 74)
INK = (18, 16, 14)

MOODS = {
    "NIGHT": ((8, 10, 18), (28, 34, 56), COPPER),
    "DAY": ((32, 38, 46), (86, 92, 102), (232, 214, 186)),
    "DUSK": ((42, 20, 24), (102, 54, 40), (226, 160, 110)),
    "DAWN": ((28, 32, 48), (118, 90, 70), (236, 206, 170)),
    "STORM": ((12, 16, 22), (40, 52, 64), (180, 198, 210)),
}


def render_part(spec: dict) -> None:
    shots = spec.get("shots") or []
    if not shots:
        raise SystemExit("Refusing to render an empty reel.")
    out = Path(spec["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    work = out.parent / f".{out.stem}-shots"
    if work.exists():
        for child in work.glob("*"):
            child.unlink()
    else:
        work.mkdir(parents=True)
    clips = []
    for index, shot in enumerate(shots):
        png = work / f"{index:03d}.png"
        clip = work / f"{index:03d}.mp4"
        draw_shot(shot, png)
        encode_still(png, float(shot.get("duration") or 3), clip)
        clips.append(clip)
    silent = work / "silent.mp4"
    concat_videos(clips, silent)
    mux_bed(silent, out)


def assemble_picture(spec: dict) -> None:
    out = Path(spec["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    work = out.parent / ".assemble"
    if work.exists():
        for child in work.glob("*"):
            child.unlink()
    else:
        work.mkdir(parents=True)
    cards = [title_card(spec, work / "title.png"), *credit_cards(spec, work)]
    clips = []
    for index, card in enumerate(cards[:1]):
        clip = work / f"card-{index:02d}.mp4"
        encode_still(card, 5.5, clip)
        clips.append(clip)
    for part in spec.get("parts") or []:
        clips.append(Path(part))
    for index, card in enumerate(cards[1:], start=1):
        clip = work / f"card-{index:02d}.mp4"
        encode_still(card, 4.8, clip)
        clips.append(clip)
    concat_videos(clips, out, reencode=True)


def title_card(spec: dict, path: Path) -> Path:
    img = base_image({"timeOfDay": "NIGHT", "heading": spec.get("title", "")})
    draw = ImageDraw.Draw(img)
    center_text(draw, "PROSCENIUM", 180, font(SANS, 18), COPPER, tracking=6)
    center_wrapped(draw, spec.get("title") or "Untitled", 250, SERIF_BOLD, 60, CREAM)
    logline = spec.get("logline") or "A picture assembled after every reel was approved."
    draw_wrapped(draw, logline, 200, 390, WIDTH - 400, font(SERIF_ITALIC, 24), MUTED, align="center")
    center_text(draw, "FROM AN APPROVED STORY AND SCRIPT", 560, font(SANS, 16), COPPER, tracking=3)
    img.save(path)
    return path


def credit_cards(spec: dict, work: Path) -> list[Path]:
    cast = spec.get("cast") or []
    pages = [cast[i:i + 5] for i in range(0, len(cast), 5)] or [[]]
    paths = []
    for index, page in enumerate(pages):
        img = base_image({"timeOfDay": "NIGHT"})
        draw = ImageDraw.Draw(img)
        center_text(draw, "CAST", 120, font(SANS, 18), COPPER, tracking=6)
        y = 190
        for entry in page:
            character = pretty(entry.get("character") or "")
            actor = entry.get("actor") or ""
            center_text(draw, character, y, font(SERIF_BOLD, 32), CREAM)
            credit = "generated fictional character" if entry.get("generated") else f"played by  {actor}"
            center_text(draw, credit, y + 40, font(SERIF_ITALIC, 22), MUTED)
            y += 88
        notes = []
        if any(item.get("generated") for item in page):
            notes.append("Generated faces are fictional adults, not a real person.")
        if any(not item.get("generated") for item in page) or not page:
            notes.append("Likeness used under a signed consent letter on file.")
        for offset, note in enumerate(notes):
            center_text(draw, note, 600 + offset * 28, font(SANS, 16), COPPER)
        path = work / f"credits-{index}.png"
        img.save(path)
        paths.append(path)
    end = base_image({"timeOfDay": "DAWN"})
    draw = ImageDraw.Draw(end)
    center_text(draw, "A PROSCENIUM PICTURE", 300, font(SANS, 18), COPPER, tracking=4)
    center_text(draw, "Merged only after every reel was approved.", 360, font(SERIF_ITALIC, 28), CREAM)
    end_path = work / "end.png"
    end.save(end_path)
    paths.append(end_path)
    return paths


def draw_shot(shot: dict, path: Path) -> None:
    kind = shot.get("type")
    if kind == "dialogue" and not shot.get("photo"):
        who = shot.get("character") or "this character"
        raise SystemExit(f"Refusing to render {who} without a consented portrait.")
    img = base_image(shot)
    if kind == "dialogue":
        img = underpaint(img, shot["photo"])
        draw_dialogue(img, shot)
    elif kind == "note":
        draw_note(ImageDraw.Draw(img), shot)
    elif kind == "slate":
        draw_slate(ImageDraw.Draw(img), shot)
    elif kind == "action":
        draw_action(img, shot)
    else:
        draw_establish(img, shot)
    frame(ImageDraw.Draw(img), mood_accent(shot))
    img.save(path)


def draw_slate(draw: ImageDraw.ImageDraw, shot: dict) -> None:
    center_text(draw, "PROSCENIUM", 220, font(SANS, 18), COPPER, tracking=6)
    center_text(draw, shot.get("heading") or "REEL", 300, font(SERIF_BOLD, 68), CREAM)
    center_text(draw, shot.get("sub") or "", 400, font(SERIF_ITALIC, 26), MUTED)


def draw_note(draw: ImageDraw.ImageDraw, shot: dict) -> None:
    center_text(draw, shot.get("heading") or "NOTE", 160, font(SANS, 18), COPPER, tracking=4)
    draw_wrapped(draw, shot.get("text") or "", 160, 240, WIDTH - 320, font(SERIF, 32), CREAM, align="center")


def draw_establish(img: Image.Image, shot: dict) -> None:
    draw = ImageDraw.Draw(img)
    draw.text((78, 78), (shot.get("heading") or "").upper(), font=font(MONO, 18), fill=COPPER)
    draw_wrapped(draw, shot.get("action") or "", 120, 220, WIDTH - 240, font(SERIF, 40), CREAM, align="left")
    draw_portraits(img, shot.get("characters") or [], y=560, size=92)


def draw_action(img: Image.Image, shot: dict) -> None:
    draw = ImageDraw.Draw(img)
    draw.text((78, 78), (shot.get("heading") or "").upper(), font=font(MONO, 16), fill=MUTED)
    draw_wrapped(draw, shot.get("text") or "", 120, 180, WIDTH - 240, font(SERIF, 34), CREAM, align="left")
    draw_portraits(img, shot.get("characters") or [], y=560, size=92)


def draw_dialogue(img: Image.Image, shot: dict) -> None:
    portrait = load_portrait(shot["photo"], (430, 520))
    img.paste(portrait, (72, 100))
    draw = ImageDraw.Draw(img)
    draw.rectangle((72, 100, 502, 620), outline=COPPER, width=2)
    draw.rectangle((80, 108, 494, 612), outline=(236, 228, 214), width=1)
    x = 540
    draw.text((x, 120), (shot.get("heading") or "").upper(), font=font(MONO, 15), fill=MUTED)
    name = pretty(shot.get("character") or "")
    draw.text((x, 170), name, font=font(SERIF_BOLD, 42), fill=CREAM)
    if shot.get("parenthetical"):
        draw.text((x, 230), shot["parenthetical"], font=font(SERIF_ITALIC, 22), fill=COPPER)
    top = 280 if shot.get("parenthetical") else 250
    draw_wrapped(draw, shot.get("line") or "", x, top, 660, font(SERIF, 32), CREAM, align="left", max_lines=7)
    actor = shot.get("actor") or ""
    if actor:
        draw.text((x, 640), f"{actor}   as   {name}", font=font(SANS, 16), fill=MUTED)


def draw_portraits(img: Image.Image, people: list, y: int, size: int) -> None:
    shown = [person for person in people if person.get("photo")][:4]
    if not shown:
        return
    total = len(shown) * (size + 24) - 24
    x = 78
    for person in shown:
        portrait = load_portrait(person["photo"], (size, size))
        img.paste(portrait, (x, y))
        draw = ImageDraw.Draw(img)
        draw.rectangle((x, y, x + size, y + size), outline=COPPER, width=2)
        x += size + 24
    del total


def base_image(shot: dict) -> Image.Image:
    top, bottom, _accent = MOODS[mood_key(shot)]
    column = Image.new("RGB", (1, HEIGHT))
    pixels = column.load()
    for y in range(HEIGHT):
        blend = y / (HEIGHT - 1)
        pixels[0, y] = tuple(int(top[i] * (1 - blend) + bottom[i] * blend) for i in range(3))
    img = column.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)
    return vignette(img)


def underpaint(img: Image.Image, photo_path: str) -> Image.Image:
    try:
        photo = open_image(photo_path)
    except Exception:
        return img
    cover = cover_crop(photo, WIDTH, HEIGHT).filter(ImageFilter.GaussianBlur(18))
    cover = ImageEnhance.Brightness(cover).enhance(0.35)
    return vignette(Image.blend(img, cover, 0.42))


def frame(draw: ImageDraw.ImageDraw, accent: tuple) -> None:
    draw.rectangle((28, 28, WIDTH - 28, HEIGHT - 28), outline=accent, width=1)
    draw.rectangle((36, 36, WIDTH - 36, HEIGHT - 36), outline=(90, 84, 74), width=1)


def vignette(img: Image.Image) -> Image.Image:
    mask = Image.new("L", (WIDTH, HEIGHT), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((-80, -60, WIDTH + 80, HEIGHT + 120), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(48))
    shade = Image.new("RGB", (WIDTH, HEIGHT), (0, 0, 0))
    darkness = mask.point(lambda value: int((255 - value) * 0.72))
    return Image.composite(shade, img, darkness)


def load_portrait(photo_path: str, size: tuple[int, int]) -> Image.Image:
    photo = open_image(photo_path)
    framed = cover_crop(photo, size[0], size[1])
    return ImageEnhance.Contrast(framed).enhance(1.05)


def open_image(photo_path: str) -> Image.Image:
    path = Path(photo_path)
    if not path.is_file():
        raise SystemExit(f"Missing portrait: {photo_path}")
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def cover_crop(img: Image.Image, width: int, height: int) -> Image.Image:
    scale = max(width / img.width, height / img.height)
    resized = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - width) // 2)
    top = max(0, (resized.height - height) // 2)
    return resized.crop((left, top, left + width, top + height))


def draw_wrapped(draw, text, x, y, max_width, face, fill, align="left", max_lines=8):
    lines = wrap_text(text, face, max_width)[:max_lines]
    line_height = face.size + 10
    for index, line in enumerate(lines):
        width = draw.textlength(line, font=face)
        left = x
        if align == "center":
            left = x + (max_width - width) / 2
        draw.text((left, y + index * line_height), line, font=face, fill=fill)


def center_wrapped(draw, text, y, font_path, size, fill):
    face = font(font_path, size)
    lines = wrap_text(text, face, WIDTH - 180) or [text]
    while len(lines) > 3 and size > 32:
        size -= 4
        face = font(font_path, size)
        lines = wrap_text(text, face, WIDTH - 180)
    for index, line in enumerate(lines[:3]):
        center_text(draw, line, y + index * (size + 8), face, fill)


def center_text(draw, text, y, face, fill, tracking=0):
    shown = tracked(text, tracking) if tracking else text
    width = draw.textlength(shown, font=face)
    draw.text(((WIDTH - width) / 2, y), shown, font=face, fill=fill)


def wrap_text(text: str, face, max_width: float) -> list[str]:
    words = (text or "").replace("\n", " ").split()
    if not words:
        return []
    lines = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        if face.getlength(trial) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def tracked(text: str, gap: int) -> str:
    return (" " * gap).join(list(text))


def font(path: str, size: int):
    from PIL import ImageFont
    return ImageFont.truetype(path, size)


def mood_key(shot: dict) -> str:
    blob = " ".join([
        str(shot.get("heading") or ""),
        str(shot.get("timeOfDay") or ""),
        str(shot.get("action") or ""),
        str(shot.get("text") or ""),
    ]).upper()
    if any(word in blob for word in ("STORM", "RAIN", "THUNDER")):
        return "STORM"
    if any(word in blob for word in ("NIGHT", "EVENING")):
        return "NIGHT"
    if any(word in blob for word in ("DUSK", "SUNSET")):
        return "DUSK"
    if any(word in blob for word in ("DAWN", "MORNING")):
        return "DAWN"
    return "DAY"


def mood_accent(shot: dict):
    return MOODS[mood_key(shot)][2]


def pretty(name: str) -> str:
    return " ".join(part.capitalize() for part in (name or "").lower().split())


def encode_still(png: Path, duration: float, out: Path) -> None:
    duration = max(0.8, duration)
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-loop", "1", "-t", f"{duration:.3f}", "-i", str(png),
        "-f", "lavfi", "-t", f"{duration:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-r", "24", "-vf", "format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "22",
        "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "2",
        "-shortest", "-movflags", "+faststart", "-video_track_timescale", "24000",
        str(out),
    ])


def concat_videos(clips: list[Path], out: Path, reencode: bool = False) -> None:
    listing = out.parent / "concat.txt"
    listing.write_text("".join(f"file '{clip.resolve()}'\n" for clip in clips))
    if not reencode:
        result = run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(listing),
            "-c", "copy", "-movflags", "+faststart", str(out),
        ], check=False)
        if result == 0 and out.exists():
            return
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(listing),
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=24",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
        str(out),
    ])


def mux_bed(silent: Path, out: Path) -> None:
    duration = probe(silent)
    bed = silent.parent / "bed.wav"
    fade_out = max(0.2, duration - 1.2)
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-t", f"{duration:.3f}", "-i", "sine=frequency=110:sample_rate=44100",
        "-f", "lavfi", "-t", f"{duration:.3f}", "-i", "sine=frequency=164.81:sample_rate=44100",
        "-f", "lavfi", "-t", f"{duration:.3f}", "-i", "sine=frequency=220:sample_rate=44100",
        "-filter_complex",
        f"[0][1][2]amix=inputs=3:duration=shortest,volume=0.08,afade=t=in:st=0:d=0.6,afade=t=out:st={fade_out:.3f}:d=1.1",
        "-ac", "2", str(bed),
    ])
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(silent), "-i", str(bed),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest",
        "-movflags", "+faststart", str(out),
    ])


def probe(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def run(command: list[str], check: bool = True) -> int:
    result = subprocess.run(command, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise SystemExit(result.stderr.strip() or "ffmpeg failed")
    return result.returncode
