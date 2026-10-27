import type { BodyComposition } from './bodyComposition'

/**
 * Codificador mínimo de archivos FIT de tipo "weight" (mensaje weight_scale),
 * el formato que Garmin usa para las mediciones de báscula.
 */
const FIT_EPOCH_OFFSET_S = 631065600 // 1989-12-31 00:00 UTC
const PROFILE_VERSION = 2132
/** 255 = "development". Si Garmin rechazara el archivo, prueba con 1 (garmin). */
const MANUFACTURER = 255
const PRODUCT = 1
const FILE_TYPE_WEIGHT = 9
const MESG_FILE_ID = 0
const MESG_WEIGHT_SCALE = 30
const ENUM = 0x00, UINT8 = 0x02, UINT16 = 0x84, UINT32 = 0x86, UINT32Z = 0x8c

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
]

export function crc16(bytes: ArrayLike<number>): number {
  let crc = 0
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i] & 0xff
    let tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[v & 0xf]
    tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[(v >> 4) & 0xf]
  }
  return crc
}

class Writer {
  bytes: number[] = []
  u8(v: number) { this.bytes.push(v & 0xff) }
  u16(v: number) { this.u8(v); this.u8(v >> 8) }
  u32(v: number) { this.u16(v & 0xffff); this.u16(Math.floor(v / 0x10000) & 0xffff) }
  definition(localType: number, globalMesg: number, fields: [number, number, number][]) {
    this.u8(0x40 | localType)
    this.u8(0) // reservado
    this.u8(0) // little endian
    this.u16(globalMesg)
    this.u8(fields.length)
    for (const [num, size, type] of fields) { this.u8(num); this.u8(size); this.u8(type) }
  }
}

const scaled = (value: number, scale: number) => Math.max(0, Math.min(0xfffe, Math.round(value * scale)))

/** composition puede ser null: entonces solo se guarda el peso. */
export function buildWeightFit(timestamp: Date, weightKg: number, composition: BodyComposition | null): Uint8Array {
  const ts = Math.floor(timestamp.getTime() / 1000) - FIT_EPOCH_OFFSET_S
  const body = new Writer()

  body.definition(0, MESG_FILE_ID, [[0, 1, ENUM], [1, 2, UINT16], [2, 2, UINT16], [3, 4, UINT32Z], [4, 4, UINT32]])
  body.u8(0)
  body.u8(FILE_TYPE_WEIGHT)
  body.u16(MANUFACTURER)
  body.u16(PRODUCT)
  body.u32(1)
  body.u32(ts)

  if (!composition) {
    body.definition(1, MESG_WEIGHT_SCALE, [[253, 4, UINT32], [0, 2, UINT16]])
    body.u8(1)
    body.u32(ts)
    body.u16(scaled(weightKg, 100))
  } else {
    body.definition(1, MESG_WEIGHT_SCALE, [
      [253, 4, UINT32], // timestamp
      [0, 2, UINT16], // weight (kg ×100)
      [1, 2, UINT16], // percent_fat (% ×100)
      [2, 2, UINT16], // percent_hydration (% ×100)
      [4, 2, UINT16], // bone_mass (kg ×100)
      [5, 2, UINT16], // muscle_mass (kg ×100)
      [7, 2, UINT16], // basal_met (kcal/día ×4)
      [11, 1, UINT8], // visceral_fat_rating
      [13, 2, UINT16], // bmi (×10)
    ])
    body.u8(1)
    body.u32(ts)
    body.u16(scaled(weightKg, 100))
    body.u16(scaled(composition.fatPercent, 100))
    body.u16(scaled(composition.waterPercent, 100))
    body.u16(scaled(composition.boneMassKg, 100))
    body.u16(scaled(composition.muscleMassKg, 100))
    body.u16(scaled(composition.bmrKcal, 4))
    body.u8(composition.visceralFat)
    body.u16(scaled(composition.bmi, 10))
  }

  const file = new Writer()
  file.u8(14) // tamaño de cabecera
  file.u8(0x10) // protocolo 1.0
  file.u16(PROFILE_VERSION)
  file.u32(body.bytes.length)
  for (const c of '.FIT') file.u8(c.charCodeAt(0))
  file.u16(crc16(file.bytes))
  file.bytes.push(...body.bytes)
  file.u16(crc16(file.bytes))
  return new Uint8Array(file.bytes)
}
