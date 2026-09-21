import json
import sys
from pathlib import Path

from studio_render import render_part


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text())
    render_part(spec)


if __name__ == "__main__":
    main()
