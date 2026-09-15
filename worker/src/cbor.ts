// Minimal CBOR codec for WebAuthn attestation / COSE keys.
// Supports the subset Chrome, Safari, and Windows Hello actually emit:
// ints (incl. negative), byte/text strings, arrays, maps, bool, null.

export type CborValue =
  | number
  | boolean
  | null
  | string
  | Uint8Array
  | CborValue[]
  | Map<CborValue, CborValue>

export function encodeCbor(value: CborValue): Uint8Array {
  const out: number[] = []
  write(out, value)
  return new Uint8Array(out)
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const ctx = { bytes, offset: 0 }
  const value = read(ctx)
  return value
}

function write(out: number[], value: CborValue): void {
  if (value === null) {
    out.push(0xf6)
    return
  }
  if (typeof value === 'boolean') {
    out.push(value ? 0xf5 : 0xf4)
    return
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('cbor: floats not supported')
    if (value >= 0) writeType(out, 0, value)
    else writeType(out, 1, -1 - value)
    return
  }
  if (typeof value === 'string') {
    const encoded = new TextEncoder().encode(value)
    writeType(out, 3, encoded.length)
    for (const b of encoded) out.push(b)
    return
  }
  if (value instanceof Uint8Array) {
    writeType(out, 2, value.length)
    for (const b of value) out.push(b)
    return
  }
  if (Array.isArray(value)) {
    writeType(out, 4, value.length)
    for (const item of value) write(out, item)
    return
  }
  if (value instanceof Map) {
    writeType(out, 5, value.size)
    for (const [k, v] of value) {
      write(out, k)
      write(out, v)
    }
    return
  }
  throw new Error('cbor: unsupported value')
}

function writeType(out: number[], major: number, n: number): void {
  const hi = major << 5
  if (n < 24) out.push(hi | n)
  else if (n < 256) out.push(hi | 24, n)
  else if (n < 65536) out.push(hi | 25, (n >> 8) & 0xff, n & 0xff)
  else if (n <= 0xffffffff) {
    out.push(
      hi | 26,
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    )
  } else {
    throw new Error('cbor: integer too large')
  }
}

function read(ctx: { bytes: Uint8Array; offset: number }): CborValue {
  if (ctx.offset >= ctx.bytes.length) throw new Error('cbor: truncated')
  const ib = ctx.bytes[ctx.offset++]!
  const major = ib >> 5
  const addl = ib & 0x1f
  const n = readLength(ctx, addl)
  switch (major) {
    case 0: return n
    case 1: return -1 - n
    case 2: {
      const slice = ctx.bytes.subarray(ctx.offset, ctx.offset + n)
      ctx.offset += n
      return new Uint8Array(slice)
    }
    case 3: {
      const slice = ctx.bytes.subarray(ctx.offset, ctx.offset + n)
      ctx.offset += n
      return new TextDecoder().decode(slice)
    }
    case 4: {
      const arr: CborValue[] = []
      for (let i = 0; i < n; i++) arr.push(read(ctx))
      return arr
    }
    case 5: {
      const map = new Map<CborValue, CborValue>()
      for (let i = 0; i < n; i++) {
        const k = read(ctx)
        const v = read(ctx)
        map.set(k, v)
      }
      return map
    }
    case 7: {
      if (addl === 20) return false
      if (addl === 21) return true
      if (addl === 22) return null
      throw new Error(`cbor: simple ${addl} not supported`)
    }
    default:
      throw new Error(`cbor: major ${major} not supported`)
  }
}

function readLength(ctx: { bytes: Uint8Array; offset: number }, addl: number): number {
  if (addl < 24) return addl
  const take = (len: number): number => {
    if (ctx.offset + len > ctx.bytes.length) throw new Error('cbor: truncated length')
    let n = 0
    for (let i = 0; i < len; i++) n = (n << 8) | ctx.bytes[ctx.offset++]!
    return n >>> 0
  }
  if (addl === 24) return take(1)
  if (addl === 25) return take(2)
  if (addl === 26) return take(4)
  throw new Error(`cbor: length ${addl} not supported`)
}

export function mapGet(map: Map<CborValue, CborValue>, key: CborValue): CborValue | undefined {
  for (const [k, v] of map) {
    if (k === key) return v
    if (k instanceof Uint8Array && key instanceof Uint8Array && bytesEq(k, key)) return v
  }
  return undefined
}

export function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}
