// Deterministic canonical JSON stringify (F2.6b). PURE, no I/O, no mutation.
//
// Used as the STABLE input to the assessment fingerprint (§9). A plain
// JSON.stringify is order-dependent for object keys, so two equal drafts could
// hash differently. This serializer sorts object keys recursively while
// preserving array order, and REJECTS any non-JSON value so a fingerprint can
// never silently depend on something unrepresentable.
//
// Accepts: null, boolean, finite number, string, plain array, plain object.
// Rejects: undefined, bigint, function, symbol, NaN/Infinity, Date and any other
//          non-plain object (Map/Set/class instances/etc.).
// The input is never mutated.

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalJsonError'
  }
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function encode(value: unknown): string {
  if (value === null) return 'null'

  const t = typeof value
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'string') return JSON.stringify(value)
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new CanonicalJsonError('non-finite number is not canonical-JSON serializable')
    }
    // JSON.stringify gives the canonical shortest round-trippable form for finite numbers.
    return JSON.stringify(value)
  }
  if (t === 'undefined') throw new CanonicalJsonError('undefined is not JSON serializable')
  if (t === 'bigint') throw new CanonicalJsonError('bigint is not JSON serializable')
  if (t === 'function') throw new CanonicalJsonError('function is not JSON serializable')
  if (t === 'symbol') throw new CanonicalJsonError('symbol is not JSON serializable')

  // Objects (arrays / plain objects only).
  if (Array.isArray(value)) {
    return `[${value.map((el) => encode(el)).join(',')}]`
  }
  if (t === 'object') {
    if (!isPlainObject(value as object)) {
      throw new CanonicalJsonError('only plain objects are canonical-JSON serializable')
    }
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts: string[] = []
    for (const key of keys) {
      // Reject undefined explicitly (§9) rather than omit it like JSON.stringify:
      // the draft uses null, never undefined, so an undefined here signals a bug we
      // want surfaced, not silently dropped from the fingerprint.
      const v = obj[key]
      if (typeof v === 'undefined') {
        throw new CanonicalJsonError(`undefined value at key "${key}" is not serializable`)
      }
      parts.push(`${JSON.stringify(key)}:${encode(v)}`)
    }
    return `{${parts.join(',')}}`
  }

  throw new CanonicalJsonError(`unsupported value of type ${t}`)
}

/** Deterministic JSON string with recursively sorted object keys. */
export function canonicalJsonStringify(value: unknown): string {
  return encode(value)
}
