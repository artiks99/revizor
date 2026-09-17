/**
 * Lightweight, zero-dependency QR Code generator in pure TypeScript.
 * Generates clean SVG markup for URLs and text.
 */

// QR Code error correction & encoding tables
const GF256_EXP = new Uint8Array(512)
const GF256_LOG = new Uint8Array(256)

;(function initGF() {
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x
    GF256_EXP[i + 255] = x
    GF256_LOG[x] = i
    x <<= 1
    if (x & 256) x ^= 0x11d
  }
  GF256_LOG[0] = 0
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]]
}

function rsGenPoly(n: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(poly.length + 1)
    const factor = GF256_EXP[i]
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor)
      next[j + 1] ^= poly[j]
    }
    poly = next
  }
  return poly
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenPoly(ecLen)
  const res = new Uint8Array(ecLen)
  for (let i = 0; i < data.length; i++) {
    const feedback = data[i] ^ res[0]
    for (let j = 0; j < ecLen - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j], feedback)
    }
    res[ecLen - 1] = gfMul(gen[ecLen - 1], feedback)
  }
  return res
}

interface VersionInfo {
  totalCodewords: number
  ecCodewords: number
  blocks: number
}

const VERSION_INFO: Record<number, VersionInfo> = {
  1: { totalCodewords: 26, ecCodewords: 10, blocks: 1 },
  2: { totalCodewords: 44, ecCodewords: 16, blocks: 1 },
  3: { totalCodewords: 70, ecCodewords: 26, blocks: 1 },
  4: { totalCodewords: 100, ecCodewords: 36, blocks: 2 },
  5: { totalCodewords: 134, ecCodewords: 48, blocks: 2 },
  6: { totalCodewords: 172, ecCodewords: 64, blocks: 4 },
  7: { totalCodewords: 196, ecCodewords: 72, blocks: 4 },
  8: { totalCodewords: 242, ecCodewords: 88, blocks: 4 },
  9: { totalCodewords: 292, ecCodewords: 110, blocks: 5 },
  10: { totalCodewords: 346, ecCodewords: 130, blocks: 5 },
}

function selectVersion(dataLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const info = VERSION_INFO[v]
    const dataCap = info.totalCodewords - info.ecCodewords - 3
    if (dataLen <= dataCap) return v
  }
  return 10
}

export interface QrOptions {
  size?: number
  darkColor?: string
  lightColor?: string
  margin?: number
}

/**
 * Generate QR code as SVG string.
 */
export function generateQrSvg(text: string, options: QrOptions = {}): string {
  const size = options.size || 220
  const dark = options.darkColor || '#0f172a'
  const light = options.lightColor || '#ffffff'
  const margin = options.margin ?? 3

  const utf8 = new TextEncoder().encode(text)
  const version = selectVersion(utf8.length)
  const info = VERSION_INFO[version]
  const moduleCount = 17 + 4 * version

  const modules: number[][] = Array.from({ length: moduleCount }, () =>
    Array(moduleCount).fill(-1)
  )

  function placeFinder(startX: number, startY: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const y = startY + r
        const x = startX + c
        if (y >= 0 && y < moduleCount && x >= 0 && x < moduleCount) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            modules[y][x] =
              r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
                ? 1
                : 0
          } else {
            modules[y][x] = 0
          }
        }
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(moduleCount - 7, 0)
  placeFinder(0, moduleCount - 7)

  if (version >= 2) {
    const alignCoords: Record<number, number[]> = {
      2: [6, 18],
      3: [6, 22],
      4: [6, 26],
      5: [6, 30],
      6: [6, 34],
      7: [6, 22, 38],
      8: [6, 24, 42],
      9: [6, 26, 46],
      10: [6, 28, 50],
    }
    const coords = alignCoords[version] || []
    for (const y of coords) {
      for (const x of coords) {
        if (modules[y][x] === -1) {
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              modules[y + r][x + c] =
                Math.max(Math.abs(r), Math.abs(c)) === 1 ? 0 : 1
            }
          }
        }
      }
    }
  }

  for (let i = 8; i < moduleCount - 8; i++) {
    if (modules[6][i] === -1) modules[6][i] = i % 2 === 0 ? 1 : 0
    if (modules[i][6] === -1) modules[i][6] = i % 2 === 0 ? 1 : 0
  }

  modules[4 * version + 9][8] = 1

  for (let i = 0; i < 9; i++) {
    if (modules[8][i] === -1) modules[8][i] = 0
    if (modules[i][8] === -1) modules[i][8] = 0
  }
  for (let i = moduleCount - 8; i < moduleCount; i++) {
    if (modules[8][i] === -1) modules[8][i] = 0
    if (modules[i][8] === -1) modules[i][8] = 0
  }

  const dataCap = info.totalCodewords - info.ecCodewords
  const bitstream: number[] = []

  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitstream.push((val >> i) & 1)
    }
  }

  pushBits(4, 4)
  pushBits(utf8.length, version < 10 ? 8 : 16)
  for (let i = 0; i < utf8.length; i++) {
    pushBits(utf8[i], 8)
  }
  const totalDataBits = dataCap * 8
  const termLen = Math.min(4, totalDataBits - bitstream.length)
  pushBits(0, termLen)
  while (bitstream.length % 8 !== 0) bitstream.push(0)
  const padBytes = [0xec, 0x11]
  let padIdx = 0
  while (bitstream.length < totalDataBits) {
    pushBits(padBytes[padIdx % 2], 8)
    padIdx++
  }

  const dataBytes = new Uint8Array(dataCap)
  for (let i = 0; i < dataCap; i++) {
    let byte = 0
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitstream[i * 8 + b]
    }
    dataBytes[i] = byte
  }

  const ecPerBlock = Math.floor(info.ecCodewords / info.blocks)
  const dataPerBlock = Math.floor(dataCap / info.blocks)
  const blocksData: Uint8Array[] = []
  const blocksEc: Uint8Array[] = []

  for (let b = 0; b < info.blocks; b++) {
    const blockData = dataBytes.slice(b * dataPerBlock, (b + 1) * dataPerBlock)
    blocksData.push(blockData)
    blocksEc.push(rsEncode(blockData, ecPerBlock))
  }

  const interleaved: number[] = []
  for (let i = 0; i < dataPerBlock; i++) {
    for (let b = 0; b < info.blocks; b++) {
      interleaved.push(blocksData[b][i])
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < info.blocks; b++) {
      interleaved.push(blocksEc[b][i])
    }
  }

  const finalBits: number[] = []
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((byte >> i) & 1)
    }
  }

  let bitIdx = 0
  let right = moduleCount - 1
  let upward = true

  while (right > 0) {
    if (right === 6) right--
    for (let v = 0; v < moduleCount; v++) {
      const y = upward ? moduleCount - 1 - v : v
      for (let d = 0; d < 2; d++) {
        const x = right - d
        if (modules[y][x] === -1) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0
          const mask = (y + x) % 2 === 0
          modules[y][x] = bit ^ (mask ? 1 : 0)
        }
      }
    }
    right -= 2
    upward = !upward
  }

  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0]
  for (let i = 0; i < 6; i++) modules[8][i] = formatBits[i]
  modules[8][7] = formatBits[6]
  modules[8][8] = formatBits[7]
  modules[7][8] = formatBits[8]
  for (let i = 0; i < 6; i++) modules[5 - i][8] = formatBits[9 + i]

  for (let i = 0; i < 8; i++) modules[8][moduleCount - 1 - i] = formatBits[i]
  for (let i = 0; i < 7; i++) modules[moduleCount - 7 + i][8] = formatBits[8 + i]

  const totalSize = moduleCount + margin * 2
  let pathData = ''
  for (let y = 0; y < moduleCount; y++) {
    for (let x = 0; x < moduleCount; x++) {
      if (modules[y][x] === 1) {
        pathData += `M${x + margin},${y + margin}h1v1h-1z `
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${totalSize}" height="${totalSize}" fill="${light}" rx="${margin}"/>
    <path d="${pathData.trim()}" fill="${dark}"/>
  </svg>`
}
