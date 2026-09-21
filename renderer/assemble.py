import json
import sys
from pathlib import Path

from studio_render import assemble_picture


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text())
    assemble_picture(spec)


if __name__ == "__main__":
    main()