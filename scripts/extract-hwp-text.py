import pathlib
import re
import sys
import zlib

sys.path.insert(0, str(pathlib.Path("tmp/hwpdeps").resolve()))

from OleFileIO_PL import OleFileIO  # type: ignore


PARA_TEXT_TAG = 67


def is_compressed(ole) -> bool:
    data = ole.openstream("FileHeader").read()
    return bool(int.from_bytes(data[36:40], "little") & 1)


def read_stream(ole, path: str, compressed: bool) -> bytes:
    data = ole.openstream(path).read()
    if not compressed:
        return data
    return zlib.decompress(data, -15)


def section_names(ole) -> list[str]:
    names = []
    for item in ole.listdir(streams=True, storages=False):
        if len(item) == 2 and item[0] == "BodyText" and re.fullmatch(r"Section\d+", item[1]):
            names.append("/".join(item))
    return sorted(names, key=lambda value: int(value.rsplit("Section", 1)[1]))


def extract_text_from_section(data: bytes) -> list[str]:
    offset = 0
    paragraphs: list[str] = []
    while offset + 4 <= len(data):
        header = int.from_bytes(data[offset:offset + 4], "little")
        offset += 4
        tag_id = header & 0x3ff
        size = (header >> 20) & 0xfff
        if size == 0xfff:
            if offset + 4 > len(data):
                break
            size = int.from_bytes(data[offset:offset + 4], "little")
            offset += 4
        payload = data[offset:offset + size]
        offset += size
        if tag_id != PARA_TEXT_TAG or not payload:
            continue
        text = payload.decode("utf-16le", errors="ignore")
        text = text.replace("\r", "\n").replace("\x00", "")
        for line in text.splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if line:
                paragraphs.append(line)
    return paragraphs


def extract_hwp(path: pathlib.Path) -> str:
    with OleFileIO(path) as ole:
        compressed = is_compressed(ole)
        lines: list[str] = []
        for section in section_names(ole):
            data = read_stream(ole, section, compressed)
            lines.extend(extract_text_from_section(data))
    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: extract-hwp-text.py INPUT.hwp OUTPUT.txt")
    source = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(extract_hwp(source), encoding="utf-8")


if __name__ == "__main__":
    main()
