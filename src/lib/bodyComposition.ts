/**
 * Composición corporal a partir de peso + impedancia.
 * Fórmulas obtenidas por ingeniería inversa del algoritmo de Xiaomi (las que usan openScale o bodycomposition).
 * Pueden diferir algo de lo que muestra Zepp Life.
 */
export interface Profile {
  heightCm: number
  age: number
  male: boolean
}

export interface BodyComposition {
  bmi: number
  fatPercent: number
  waterPercent: number
  boneMassKg: number
  muscleMassKg: number
  bmrKcal: number
  visceralFat: number
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function calculateBodyComposition(weight: number, impedance: number, p: Profile): BodyComposition {
  const { heightCm: height, age, male } = p

  let lbm = (height * 9.058 / 100) * (height / 100)
  lbm += weight * 0.32 + 12.226
  lbm -= impedance * 0.0068
  lbm -= age * 0.0542

  // Grasa
  const constant = !male && age <= 49 ? 9.25 : !male ? 7.25 : 0.8
  let coefficient = 1.0
  if (male && weight < 61) coefficient = 0.98
  else if (!male && weight > 60) coefficient = height > 160 ? 0.96 * 1.03 : 0.96
  else if (!male && weight < 50) coefficient = height > 160 ? 1.02 * 1.03 : 1.02
  let fat = (1.0 - ((lbm - constant) * coefficient) / weight) * 100
  if (fat > 63) fat = 75
  fat = clamp(fat, 5, 75)

  // Agua
  let water = (100 - fat) * 0.7
  const waterCoef = water <= 50 ? 1.02 : 0.98
  if (water * waterCoef >= 65) water = 75
  water = clamp(water * waterCoef, 35, 75)

  // Hueso
  let bone = ((male ? 0.18016894 : 0.245691014) - lbm * 0.05158) * -1
  bone = bone > 2.2 ? bone + 0.1 : bone - 0.1
  if (!male && bone > 5.1) bone = 8
  else if (male && bone > 5.2) bone = 8
  bone = clamp(bone, 0.5, 8)

  // Músculo
  let muscle = weight - fat * 0.01 * weight - bone
  if (!male && muscle >= 84) muscle = 120
  else if (male && muscle >= 93.5) muscle = 120
  muscle = clamp(muscle, 10, 120)

  // Grasa visceral (fórmula corregida de bodymiscale; la de openScale salía unos 4 puntos alta)
  let vfal: number
  if (male) {
    if (height < weight * 1.6 + 63) vfal = age * 0.15 + (weight * 305) / (height * 0.0826 * height - height * 0.4 + 48) - 2.9
    else vfal = age * 0.15 + (weight * (height * -0.0015 + 0.765) - height * 0.143) - 5
  } else if (weight <= height * 0.5 - 13) {
    vfal = age * 0.07 + (weight * (height * -0.0024 + 0.691) - height * 0.027) - 10.5
  } else {
    vfal = age * 0.07 + (weight * 500) / (height * 1.45 + height * 0.1158 * height - 120) - 6
  }
  vfal = clamp(vfal, 1, 50)

  // Metabolismo basal
  let bmr: number
  if (!male) {
    bmr = 864.6 + weight * 10.2036 - height * 0.39336 - age * 6.204
    if (bmr > 2996) bmr = 5000
  } else {
    bmr = 877.8 + weight * 14.916 - height * 0.726 - age * 8.976
    if (bmr > 2322) bmr = 5000
  }
  bmr = clamp(bmr, 500, 10000)

  const bmi = clamp(weight / ((height / 100) ** 2), 10, 90)

  return { bmi, fatPercent: fat, waterPercent: water, boneMassKg: bone, muscleMassKg: muscle, bmrKcal: bmr, visceralFat: Math.round(vfal) }
}
