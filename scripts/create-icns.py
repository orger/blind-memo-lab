#!/usr/bin/env python3
"""Package the native PNG icon artwork into the documented ICNS chunk format."""
import argparse
from pathlib import Path
import struct


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("iconset", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    # PNG-backed sizes supported by modern macOS, including Retina variants.
    entries = [
        (b"icp4", "icon_16x16.png", 16),
        (b"icp5", "icon_32x32.png", 32),
        (b"icp6", "icon_32x32@2x.png", 64),
        (b"ic07", "icon_128x128.png", 128),
        (b"ic08", "icon_256x256.png", 256),
        (b"ic09", "icon_512x512.png", 512),
        (b"ic10", "icon_512x512@2x.png", 1024),
        (b"ic11", "icon_16x16@2x.png", 32),
        (b"ic12", "icon_32x32@2x.png", 64),
        (b"ic13", "icon_128x128@2x.png", 256),
        (b"ic14", "icon_256x256@2x.png", 512),
    ]
    chunks = []
    for code, filename, size in entries:
        png = (args.iconset / filename).read_bytes()
        if png[:8] != b"\x89PNG\r\n\x1a\n" or png[12:16] != b"IHDR":
            raise ValueError(f"{filename} is not a PNG")
        if struct.unpack(">II", png[16:24]) != (size, size):
            raise ValueError(f"{filename} must be {size} × {size} pixels")
        chunks.append(code + struct.pack(">I", len(png) + 8) + png)
    body = b"".join(chunks)
    result = b"icns" + struct.pack(">I", len(body) + 8) + body
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".icns.tmp")
    temporary.write_bytes(result)
    temporary.replace(args.output)
    print(f"Packaged {len(entries)} icon representations: {args.output}")


if __name__ == "__main__":
    main()
