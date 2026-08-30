'use strict'
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// CRC32
const CRC = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  CRC[i] = c
}
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (~c) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const l = Buffer.allocUnsafe(4); l.writeUInt32BE(data.length)
  const k = Buffer.allocUnsafe(4); k.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([l, t, data, k])
}

function makePNG(px, size) {
  const rows = []
  for (let y = 0; y < size; y++) {
    rows.push(0)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      rows.push(px[i], px[i+1], px[i+2], px[i+3])
    }
  }
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.from(rows))),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4)
  // Dark background #0A0F1E
  for (let i = 0; i < px.length; i += 4) { px[i]=10; px[i+1]=15; px[i+2]=30; px[i+3]=255 }

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    px[i]=r; px[i+1]=g; px[i+2]=b; px[i+3]=a
  }

  const cx = size / 2, cy = size / 2
  const R = 0, G = 212, B = 255

  // Shield params
  const sw = size * 0.56, sh = size * 0.66
  const sx = Math.round(cx - sw/2), sy = Math.round(size * 0.11)
  const ex = Math.round(sx + sw), midY = Math.round(sy + sh * 0.54), tipY = Math.round(sy + sh)

  // Draw shield outline pixel by pixel
  for (let x = sx; x <= ex; x++) { set(x, sy, R,G,B); set(x, sy+1, R,G,B,140) }
  for (let y = sy; y <= midY; y++) {
    set(sx, y, R,G,B); set(sx+1, y, R,G,B,140)
    set(ex, y, R,G,B); set(ex-1, y, R,G,B,140)
  }
  for (let y = midY; y <= tipY; y++) {
    const t = (y - midY) / Math.max(1, tipY - midY)
    const lx = Math.round(sx + t * (cx - sx))
    const rx = Math.round(ex - t * (ex - cx))
    set(lx, y, R,G,B); set(lx+1, y, R,G,B,140)
    if (lx+1 < rx-1) { set(rx, y, R,G,B); set(rx-1, y, R,G,B,140) }
  }

  // Center hub
  const dotY = Math.round(size * 0.5)
  const nr = Math.max(1, Math.round(size * 0.065))
  for (let dy = -nr; dy <= nr; dy++)
    for (let dx = -nr; dx <= nr; dx++)
      if (dx*dx+dy*dy <= nr*nr) set(Math.round(cx)+dx, dotY+dy, R,G,B,230)

  // Satellite nodes + lines
  const nodes = [
    [Math.round(cx), Math.round(sy + sh*0.18)],
    [Math.round(sx + sw*0.14), Math.round(sy + sh*0.71)],
    [Math.round(sx + sw*0.86), Math.round(sy + sh*0.71)],
  ]
  for (const [nx, ny] of nodes) {
    const r2 = Math.max(1, Math.round(size * 0.042))
    for (let dy=-r2; dy<=r2; dy++)
      for (let dx=-r2; dx<=r2; dx++)
        if (dx*dx+dy*dy<=r2*r2) set(nx+dx, ny+dy, R,G,B,190)
    const steps = Math.max(Math.abs(nx-Math.round(cx)), Math.abs(ny-dotY))
    for (let s=0; s<=steps; s++) {
      const tt = s/Math.max(1,steps)
      set(Math.round(cx+(nx-cx)*tt), Math.round(dotY+(ny-dotY)*tt), R,G,B,100)
    }
  }

  return px
}

function makeICO(sizes) {
  const pngs = sizes.map(s => makePNG(drawIcon(s), s))
  const header = Buffer.allocUnsafe(6)
  header.writeUInt16LE(0,0); header.writeUInt16LE(1,2); header.writeUInt16LE(pngs.length,4)
  let offset = 6 + pngs.length * 16
  const entries = pngs.map((png, i) => {
    const s = sizes[i], e = Buffer.allocUnsafe(16)
    e[0] = s>=256?0:s; e[1] = s>=256?0:s; e[2]=0; e[3]=0
    e.writeUInt16LE(1,4); e.writeUInt16LE(32,6)
    e.writeUInt32LE(png.length,8); e.writeUInt32LE(offset,12)
    offset += png.length
    return e
  })
  return Buffer.concat([header,...entries,...pngs])
}

const outDir = path.join(__dirname, 'public')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'sentinet-favicon.ico'), makeICO([16, 32, 48]))
console.log('✓ sentinet-favicon.ico généré dans public/')
