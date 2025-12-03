#!/usr/bin/env python3
import argparse
from PIL import Image, ImageDraw
import os

def main():
    p = argparse.ArgumentParser(description='Crop and annotate around a coordinate')
    p.add_argument('--image', required=True, help='Path to source image')
    p.add_argument('--x', type=int, required=True, help='X coordinate')
    p.add_argument('--y', type=int, required=True, help='Y coordinate')
    p.add_argument('--size', type=int, default=120, help='Crop box size (square)')
    p.add_argument('--outdir', default='', help='Output directory (default same as image)')
    args = p.parse_args()

    im = Image.open(args.image).convert('RGB')
    w, h = im.size
    x, y = args.x, args.y
    half = args.size // 2

    left = max(0, x - half)
    top = max(0, y - half)
    right = min(w, x + half)
    bottom = min(h, y + half)

    crop = im.crop((left, top, right, bottom))

    # Prepare outputs
    outdir = args.outdir or os.path.dirname(os.path.abspath(args.image))
    os.makedirs(outdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(args.image))[0]
    crop_path = os.path.join(outdir, f"{base}-crop-{x}-{y}.png")
    anno_path = os.path.join(outdir, f"{base}-annotated-{x}-{y}.png")

    crop.save(crop_path)

    # Annotate original
    anno = im.copy()
    draw = ImageDraw.Draw(anno)
    # rectangle
    draw.rectangle([(left, top), (right, bottom)], outline=(255, 0, 0), width=3)
    # point crosshair
    r = 6
    draw.ellipse([(x - r, y - r), (x + r, y + r)], outline=(0, 255, 0), width=3)
    anno.save(anno_path)

    print('crop_path:', crop_path)
    print('annotated_path:', anno_path)
    print('image_size:', w, h)
    print('box:', left, top, right, bottom)

if __name__ == '__main__':
    main()

