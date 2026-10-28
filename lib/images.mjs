// Pixel size of an image from its file header, for <img width height>: with both set, the browser reserves the
// image's box before it loads, so lazy images don't push the text (or a #link target) down as they arrive.
// PNG, GIF, JPEG, WebP and SVG only; other formats get no size and lay out as before.

const wh = (width, height) => width > 0 && height > 0 ? { width, height } : undefined

// { width, height } or undefined (unknown format, truncated file, or an SVG that doesn't fix its size).
export function imageSize(buf) {
  const ascii = (at, n) => buf.toString('latin1', at, at + n)
  try {
    if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return wh(buf.readUInt32BE(16), buf.readUInt32BE(20))
    if (/^GIF8[79]a$/.test(ascii(0, 6))) return wh(buf.readUInt16LE(6), buf.readUInt16LE(8))
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return webp(buf, ascii(12, 4))
    if (buf[0] === 0xff && buf[1] === 0xd8) return jpeg(buf)
    return svg(buf.toString('utf8'))
  } catch {
    return undefined // read past the end: a truncated or malformed header
  }
}

function webp(buf, chunk) {
  if (chunk === 'VP8 ') return wh(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff)
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return wh((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
  }
  if (chunk === 'VP8X') return wh(buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1)
}

// Walk the segments to the frame header (SOF0-15 except DHT, JPG and DAC, which share the range).
function jpeg(buf) {
  let turned = false
  for (let at = 2; ; at += 2 + buf.readUInt16BE(at + 2)) {
    if (buf[at] !== 0xff) return undefined
    const marker = buf[at + 1]
    // EXIF orientations 5-8 turn the photo a quarter; browsers apply it, so width and height swap.
    if (marker === 0xe1 && buf.toString('latin1', at + 4, at + 10) === 'Exif\0\0') turned = orientation(buf, at + 10) >= 5
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = buf.readUInt16BE(at + 5), width = buf.readUInt16BE(at + 7)
      return turned ? wh(height, width) : wh(width, height)
    }
  }
}

// The Orientation tag (0x0112) of the first IFD in a TIFF block; 1 (upright) when absent.
function orientation(buf, tiff) {
  const le = buf.toString('latin1', tiff, tiff + 2) === 'II'
  const u16 = at => le ? buf.readUInt16LE(at) : buf.readUInt16BE(at)
  const ifd = tiff + (le ? buf.readUInt32LE(tiff + 4) : buf.readUInt32BE(tiff + 4))
  for (let n = u16(ifd), at = ifd + 2; n > 0; n--, at += 12) if (u16(at) === 0x0112) return u16(at + 8)
  return 1
}

// Only absolute width and height (unitless or px) fix an SVG's size. With %, other units or just a viewBox the
// browser sizes it to the layout, and attributes would change that.
function svg(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? ''
  const px = name => Number(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*(?:px)?\\s*["']`).exec(tag)?.[1])
  return wh(Math.round(px('width')), Math.round(px('height')))
}
