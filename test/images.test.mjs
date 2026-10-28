import test from 'node:test'
import assert from 'node:assert/strict'
import { imageSize } from '../lib/images.mjs'

const bytes = (...parts) => Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))
const u16be = n => [n >> 8, n & 255]
const u16le = n => [n & 255, n >> 8]
const u32be = n => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]
const u24le = n => [n & 255, (n >> 8) & 255, n >> 16]

const png = bytes('\x89PNG\r\n\x1a\n', u32be(13), 'IHDR', u32be(640), u32be(480), [8, 6, 0, 0, 0])
const sof = (marker, w, h) => bytes([0xff, marker], u16be(17), [8], u16be(h), u16be(w), [3], new Array(9).fill(0))
const app0 = bytes([0xff, 0xe0], u16be(16), 'JFIF\0', new Array(9).fill(0))
const dht = bytes([0xff, 0xc4], u16be(4), [0, 0])
// APP1 with a big-endian TIFF block holding one IFD entry: Orientation (SHORT) = n
const exif = n => {
  const tiff = bytes('MM', u16be(42), u32be(8), u16be(1), u16be(0x0112), u16be(3), u32be(1), u16be(n), [0, 0], u32be(0))
  return bytes([0xff, 0xe1], u16be(2 + 6 + tiff.length), 'Exif\0\0', tiff)
}
const jpeg = (...segments) => bytes([0xff, 0xd8], ...segments)

test('raster formats', () => {
  assert.deepEqual(imageSize(png), { width: 640, height: 480 })
  assert.deepEqual(imageSize(bytes('GIF89a', u16le(120), u16le(40))), { width: 120, height: 40 })
  assert.deepEqual(imageSize(jpeg(app0, sof(0xc0, 800, 600))), { width: 800, height: 600 })
  assert.deepEqual(imageSize(jpeg(app0, dht, sof(0xc2, 800, 600))), { width: 800, height: 600 }, 'progressive, DHT skipped')
  assert.deepEqual(imageSize(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ', [0, 0, 0, 0], [0, 0, 0], [0x9d, 1, 0x2a], u16le(300), u16le(200))), { width: 300, height: 200 })
  const lossless = (299) | (199 << 14)
  assert.deepEqual(imageSize(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8L', [0, 0, 0, 0], [0x2f], [lossless & 255, (lossless >> 8) & 255, (lossless >> 16) & 255, lossless >>> 24])), { width: 300, height: 200 })
  assert.deepEqual(imageSize(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8X', [0, 0, 0, 0], [0, 0, 0, 0], u24le(299), u24le(199))), { width: 300, height: 200 })
})

test('JPEG EXIF orientation 5-8 swaps width and height, as browsers display it', () => {
  assert.deepEqual(imageSize(jpeg(exif(6), sof(0xc0, 4000, 3000))), { width: 3000, height: 4000 })
  assert.deepEqual(imageSize(jpeg(exif(8), sof(0xc0, 4000, 3000))), { width: 3000, height: 4000 })
  assert.deepEqual(imageSize(jpeg(exif(3), sof(0xc0, 4000, 3000))), { width: 4000, height: 3000 })
})

test('SVG: only absolute width and height count', () => {
  const svg = attrs => Buffer.from(`<?xml version="1.0"?>\n<!-- 그림 -->\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect stroke-width="2"/></svg>`)
  assert.deepEqual(imageSize(svg('viewBox="0 0 680 240" width="680" height="240"')), { width: 680, height: 240 })
  assert.deepEqual(imageSize(svg("width='20px' height='20.4px'")), { width: 20, height: 20 })
  for (const attrs of ['viewBox="0 0 680 240"', 'width="100%" height="240"', 'width="10em" height="5em"', 'width="680"', 'stroke-width="2" height="9"']) {
    assert.equal(imageSize(svg(attrs)), undefined, attrs)
  }
})

test('unknown, truncated or empty files have no size', () => {
  for (const buf of [Buffer.alloc(0), Buffer.from('plain text'), png.subarray(0, 20), jpeg(app0), jpeg(app0).subarray(0, 7),
    bytes('GIF89a', u16le(0), u16le(40)), bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')]) {
    assert.equal(imageSize(buf), undefined)
  }
})
