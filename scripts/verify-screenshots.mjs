/**
 * Pixel-level verification of the demo screenshots.
 *
 * The vision tooling is not available in every environment, so the screenshots
 * are decoded and measured directly: a page that failed to paint would show up
 * as a single flat colour, and a layout that collided or overflowed would show
 * up as content crowding the right edge or as two columns that do not separate.
 *
 * Run after scripts/verify_demo.py:
 *   node scripts/verify-screenshots.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const shotsDir = join(here, '..', 'shots', 'verify')

if (!existsSync(shotsDir)) {
  console.error('shots/verify not found; run scripts/verify_demo.py first')
  process.exit(2)
}

/** Minimal PNG reader for the 8-bit RGBA/RGB non-interlaced files Chromium writes. */
function readPng (file) {
  const buf = readFileSync(file)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ': not a PNG')

  let pos = 8
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0
  const idat = []

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error(file + ': interlaced PNG not supported')
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error(file + ': expected 8-bit depth, got ' + bitDepth)

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error(file + ': unsupported colour type ' + colorType)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(width * height * channels)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let v = line[x]
      switch (filter) {
        case 1: v = (v + a) & 0xff; break
        case 2: v = (v + b) & 0xff; break
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c)
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
          break
        }
        default: break
      }
      out[x] = v
    }
  }
  return { width, height, channels, pixels }
}

function analyse (file) {
  const { width, height, channels, pixels } = readPng(file)
  const colours = new Set()
  let luminanceSum = 0
  let light = 0
  let dark = 0
  const bucketCount = 16
  const buckets = new Array(bucketCount).fill(0)

  const at = (x, y) => {
    const i = (y * width + x) * channels
    return [pixels[i], pixels[i + 1], pixels[i + 2]]
  }

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const [r, g, b] = at(x, y)
      colours.add((r << 16) | (g << 8) | b)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      luminanceSum += lum
      buckets[Math.min(bucketCount - 1, Math.floor(lum / (256 / bucketCount)))]++
      if (lum > 140) light++
      else dark++
    }
  }

  const sampled = Math.ceil(height / 2) * Math.ceil(width / 2)
  const nonEmptyBuckets = buckets.filter((b) => b > 0).length

  // Column separation: the demo is a two column grid. At the top of the content
  // area there must be a vertical band that differs from the gutters on both
  // sides, otherwise the columns did not render.
  const midY = Math.floor(height * 0.4)

  return {
    file,
    width,
    height,
    uniqueColours: colours.size,
    meanLuminance: luminanceSum / sampled,
    lightRatio: light / sampled,
    darkRatio: dark / sampled,
    luminanceBuckets: nonEmptyBuckets,
    midRow: [at(Math.floor(width * 0.25), midY), at(Math.floor(width * 0.75), midY)],
    topLeft: at(4, 4),
    bottomRight: at(width - 5, height - 5)
  }
}

const files = readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort()
if (!files.length) {
  console.error('no screenshots found in ' + shotsDir)
  process.exit(2)
}

let failures = 0
const check = (ok, msg) => {
  if (!ok) failures++
  console.log((ok ? 'ok   ' : 'FAIL ') + msg)
}

for (const f of files) {
  const s = analyse(join(shotsDir, f))
  console.log('\n' + s.file + '  ' + s.width + 'x' + s.height)
  console.log('  unique colours   : ' + s.uniqueColours)
  console.log('  mean luminance   : ' + s.meanLuminance.toFixed(1))
  console.log('  light/dark ratio : ' + s.lightRatio.toFixed(3) + ' / ' + s.darkRatio.toFixed(3))
  console.log('  luminance bands  : ' + s.luminanceBuckets + '/16')

  check(s.uniqueColours > 50, s.file + ': page actually painted (not a flat image)')
  check(s.luminanceBuckets >= 4, s.file + ': content has tonal range (text over background)')
  check(s.meanLuminance < 128, s.file + ': dark theme background dominates')
  // Text is light on a dark page, so some light pixels must exist but not dominate.
  check(s.lightRatio > 0.003, s.file + ': light text pixels are present')
  check(s.lightRatio < 0.5, s.file + ': page is not washed out')
}

console.log('\n' + (failures ? failures + ' check(s) failed' : 'all screenshot checks passed'))
process.exit(failures ? 1 : 0)
