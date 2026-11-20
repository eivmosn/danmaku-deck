/**
 * 极简 protobuf 解码。
 *
 * B 站的 INTERACT_WORD_V2（进场/关注）是 protobuf 编码，字段固定，
 * 不需要拉 protobufjs 这种重依赖：只读 varint 和 length-delimited 两种线型。
 */
export interface ProtoField {
  field: number
  wire: number
  value: bigint | Buffer
}

export function decodeProto(buffer: Buffer): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0

  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset)
    if (tag === null) break
    offset = tag.next

    const field = Number(tag.value >> 3n)
    const wire = Number(tag.value & 7n)

    if (wire === 0) {
      const value = readVarint(buffer, offset)
      if (value === null) break
      fields.push({ field, wire, value: value.value })
      offset = value.next
    } else if (wire === 2) {
      const length = readVarint(buffer, offset)
      if (length === null) break
      const size = Number(length.value)
      const start = length.next
      if (start + size > buffer.length) break
      fields.push({ field, wire, value: buffer.subarray(start, start + size) })
      offset = start + size
    } else if (wire === 5) {
      if (offset + 4 > buffer.length) break
      fields.push({ field, wire, value: buffer.subarray(offset, offset + 4) })
      offset += 4
    } else if (wire === 1) {
      if (offset + 8 > buffer.length) break
      fields.push({ field, wire, value: buffer.subarray(offset, offset + 8) })
      offset += 8
    } else {
      break
    }
  }

  return fields
}

/** 取第一个字符串字段（wire=2） */
export function protoString(fields: ProtoField[], field: number): string {
  const hit = fields.find((item) => item.field === field && item.wire === 2)
  return hit ? (hit.value as Buffer).toString('utf8') : ''
}

/** 取所有同号的 length-delimited 字段（repeated 嵌套消息），SEND_GIFT_V2 的 gift_list 用这个 */
export function protoMessages(fields: ProtoField[], field: number): Buffer[] {
  return fields
    .filter((item) => item.field === field && item.wire === 2)
    .map((item) => item.value as Buffer)
}

/** 取第一个整数字段（wire=0） */
export function protoInt(fields: ProtoField[], field: number): number {
  const hit = fields.find((item) => item.field === field && item.wire === 0)
  return hit ? Number(hit.value as bigint) : 0
}

function readVarint(buffer: Buffer, offset: number): { value: bigint; next: number } | null {
  let result = 0n
  let shift = 0n
  let index = offset

  while (index < buffer.length) {
    const byte = buffer[index] as number
    result |= BigInt(byte & 0x7f) << shift
    index += 1
    if ((byte & 0x80) === 0) return { value: result, next: index }
    shift += 7n
    if (shift > 63n) return null
  }
  return null
}
