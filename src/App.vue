<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { BleClient, ScanMode, type ScanResult } from '@capacitor-community/bluetooth-le'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { parseMiScale2, type Measurement } from './lib/miScale2'
import { calculateBodyComposition, type BodyComposition, type Profile } from './lib/bodyComposition'
import { buildWeightFit } from './lib/fit'

/** Dirección Bluetooth de tu báscula. */
const SCALE_MAC = '5C:CA:D3:5F:BA:DA'
const SCAN_TIMEOUT_MS = 120_000
/** Mediciones más antiguas se consideran la anterior, que la báscula sigue anunciando un rato. */
const MAX_MEASUREMENT_AGE_MS = 15 * 60_000

const profile = reactive<Profile>(loadProfile())
watch(profile, (p) => localStorage.setItem('perfil', JSON.stringify(p)))

const scanning = ref(false)
const status = ref('Pulsa «Medir» y súbete descalzo a la báscula.')
const liveWeight = ref<number | null>(null)
const measurement = ref<Measurement | null>(null)
const composition = ref<BodyComposition | null>(null)
let timeoutId: number | undefined

const profileValid = computed(
  () => profile.heightCm >= 100 && profile.heightCm <= 250 && profile.age >= 6 && profile.age <= 99,
)
const profileSummary = computed(() =>
  profileValid.value ? `${profile.heightCm} cm, ${profile.age} años, ${profile.male ? 'hombre' : 'mujer'}` : 'sin completar',
)
const stable = computed(() => measurement.value !== null)
const weightText = computed(() => {
  const w = measurement.value?.weightKg ?? liveWeight.value
  return w === null ? '--,--' : fmt(w, 2)
})

const metrics = computed(() => {
  const c = composition.value
  if (!c || !measurement.value) return []
  return [
    ['Grasa corporal', `${fmt(c.fatPercent, 1)} %`],
    ['Masa muscular', `${fmt(c.muscleMassKg, 1)} kg`],
    ['Agua', `${fmt(c.waterPercent, 1)} %`],
    ['Masa ósea', `${fmt(c.boneMassKg, 1)} kg`],
    ['Grasa visceral', String(c.visceralFat)],
    ['IMC', fmt(c.bmi, 1)],
    ['Metabolismo basal', `${fmt(c.bmrKcal, 0)} kcal`],
    ['Impedancia', `${measurement.value.impedance} Ω`],
  ]
})

function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem('perfil') ?? '')
    if (typeof p.heightCm === 'number' && typeof p.age === 'number') return { heightCm: p.heightCm, age: p.age, male: !!p.male }
  } catch {
    /* sin perfil guardado */
  }
  return { heightCm: 0, age: 0, male: true }
}

function fmt(n: number, decimals: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtDate(d: Date) {
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function toggleScan() {
  if (scanning.value) {
    await stopScan()
    status.value = 'Medición detenida.'
  } else {
    await startScan()
  }
}

async function startScan() {
  if (!profileValid.value) {
    status.value = 'Completa tus datos: altura entre 100 y 250 cm y edad entre 6 y 99.'
    return
  }
  try {
    await BleClient.initialize()
    if (!(await BleClient.isEnabled())) {
      try {
        await BleClient.requestEnable()
      } catch {
        /* el usuario no lo activó */
      }
      if (!(await BleClient.isEnabled())) {
        status.value = 'Activa el Bluetooth para leer la báscula.'
        return
      }
    }
    measurement.value = null
    composition.value = null
    liveWeight.value = null
    await BleClient.requestLEScan({ allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY }, onScanResult)
    scanning.value = true
    status.value = 'Buscando la báscula. Súbete descalzo.'
    timeoutId = window.setTimeout(async () => {
      await stopScan()
      status.value = measurement.value
        ? 'No llegó la impedancia. ¿Estabas descalzo? Puedes guardar solo el peso.'
        : 'No llegó ninguna medición. Súbete a la báscula y vuelve a pulsar «Medir».'
    }, SCAN_TIMEOUT_MS)
  } catch (e) {
    status.value = `No se pudo usar el Bluetooth: ${(e as Error).message}. Revisa los permisos de la app.`
  }
}

async function stopScan() {
  window.clearTimeout(timeoutId)
  if (!scanning.value) return
  scanning.value = false
  try {
    await BleClient.stopLEScan()
  } catch {
    /* ya estaba parado */
  }
}

function onScanResult(r: ScanResult) {
  if (!scanning.value || r.device.deviceId.toUpperCase() !== SCALE_MAC || !r.serviceData) return
  const key = Object.keys(r.serviceData).find((k) => k.toLowerCase().includes('181b'))
  const m = key ? parseMiScale2(r.serviceData[key]) : null
  if (!m || m.removed) return

  if (m.timestampFromScale && Date.now() - m.timestamp.getTime() > MAX_MEASUREMENT_AGE_MS) {
    status.value = `La báscula aún muestra la medición del ${fmtDate(m.timestamp)}. Súbete para medir de nuevo.`
    return
  }
  if (!m.stabilized) {
    liveWeight.value = m.weightKg
    status.value = 'Estabilizando…'
    return
  }

  measurement.value = m
  if (m.hasImpedance) {
    composition.value = calculateBodyComposition(m.weightKg, m.impedance, { ...profile })
    status.value = `Medición completa · ${fmtDate(m.timestamp)}`
    stopScan()
  } else {
    composition.value = null
    status.value = 'Peso estable. Sigue descalzo unos segundos para medir la composición.'
  }
}

async function saveFit() {
  const m = measurement.value
  if (!m) return
  const bytes = buildWeightFit(m.timestamp, m.weightKg, composition.value)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  const pad = (n: number) => String(n).padStart(2, '0')
  const t = m.timestamp
  const name = `peso_${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}.fit`
  try {
    const file = await Filesystem.writeFile({ path: name, data: btoa(binary), directory: Directory.Cache })
    await Share.share({ title: name, files: [file.uri], dialogTitle: 'Guardar el archivo .FIT' })
    status.value = 'Archivo listo. Impórtalo desde la web de Garmin Connect.'
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (!/cancel/i.test(msg)) status.value = `No se pudo guardar el archivo: ${msg}`
  }
}

onBeforeUnmount(stopScan)
</script>

<template>
  <main>
    <section class="display" :class="{ scanning, stable }" aria-live="polite">
      <p class="weight">
        <span class="value">{{ weightText }}</span>
        <span class="unit">kg</span>
      </p>
      <p class="status">{{ status }}</p>
    </section>

    <dl v-if="metrics.length" class="metrics">
      <div v-for="[label, value] in metrics" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>

    <div class="actions">
      <button class="primary" type="button" @click="toggleScan">{{ scanning ? 'Detener' : 'Medir' }}</button>
      <button class="secondary" type="button" :disabled="!measurement" @click="saveFit">Guardar .FIT</button>
    </div>

    <details class="profile" :open="!profileValid">
      <summary>Tus datos <span>{{ profileSummary }}</span></summary>
      <div class="fields">
        <label>
          Altura (cm)
          <input v-model.number="profile.heightCm" type="number" inputmode="numeric" min="100" max="250" />
        </label>
        <label>
          Edad
          <input v-model.number="profile.age" type="number" inputmode="numeric" min="6" max="99" />
        </label>
      </div>
      <div class="sex" role="radiogroup" aria-label="Sexo">
        <button type="button" role="radio" :aria-checked="profile.male" @click="profile.male = true">Hombre</button>
        <button type="button" role="radio" :aria-checked="!profile.male" @click="profile.male = false">Mujer</button>
      </div>
      <p class="hint">Se usan para calcular la composición corporal. Deben coincidir con los de Zepp Life.</p>
    </details>
  </main>
</template>
