/**
 * Decodifica el "service data" (UUID 0x181B) que anuncia la Mi Body Composition Scale 2 (XMTZC05HM).
 *
 * Formato (13 bytes, little endian):
 *  [0]      control 0 (bit 0 = libras)
 *  [1]      control 1 (bit 1 = hay impedancia, bit 5 = estable, bit 6 = jin, bit 7 = peso retirado)
 *  [2..3]   año, [4] mes, [5] día, [6] hora, [7] minuto, [8] segundo (reloj de la báscula, hora local)
 *  [9..10]  impedancia (ohmios)
 *  [11..12] peso (kg × 200, o lb/jin × 100)
 */
export interface Measurement {
  weightKg: number
  impedance: number
  stabilized: boolean
  hasImpedance: boolean
  removed: boolean
  timestamp: Date
  timestampFromScale: boolean
}

export function parseMiScale2(d: DataView | undefined): Measurement | null {
  if (!d || d.byteLength < 13) return null

  const c0 = d.getUint8(0)
  const c1 = d.getUint8(1)
  const lbs = (c0 & 0x01) !== 0
  const jin = (c1 & 0x40) !== 0
  const stabilized = (c1 & 0x20) !== 0
  const impedanceBit = (c1 & 0x02) !== 0
  const removed = (c1 & 0x80) !== 0

  const rawWeight = d.getUint16(11, true)
  let weightKg: number
  if (lbs) weightKg = (rawWeight / 100) * 0.45359237
  else if (jin) weightKg = (rawWeight / 100) * 0.5
  else weightKg = rawWeight / 200

  const impedance = d.getUint16(9, true)
  const hasImpedance = impedanceBit && impedance > 0 && impedance < 3000

  let timestamp = new Date()
  let timestampFromScale = false
  const year = d.getUint16(2, true)
  const [month, day, hour, min, sec] = [4, 5, 6, 7, 8].map((i) => d.getUint8(i))
  if (year >= 2020 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour < 24 && min < 60 && sec < 60) {
    timestamp = new Date(year, month - 1, day, hour, min, sec)
    timestampFromScale = true
  }

  return { weightKg, impedance, stabilized, hasImpedance, removed, timestamp, timestampFromScale }
}
