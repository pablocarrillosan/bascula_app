# Báscula → Garmin

App Android (Vue + Capacitor) que lee la Mi Body Composition Scale 2 por Bluetooth, calcula la
composición corporal y genera un archivo `.FIT` de peso para importarlo en Garmin Connect.
Sin servidores y sin contraseña de Garmin.

## Conseguir el APK (sin instalar nada)
1. Crea un repositorio en GitHub (puede ser privado) y sube esta carpeta tal cual.
2. En la pestaña **Actions**, el flujo «Compilar APK» se lanza solo con cada push a `main`
   (o a mano con «Run workflow»). Tarda unos minutos.
3. Abre la ejecución terminada y descarga el artefacto `bascula-garmin-apk` (es un .zip con el `app-debug.apk`).
4. Pásalo al móvil e instálalo (Android pedirá permitir instalar apps de origen desconocido).

## Uso
1. Completa altura, edad y sexo (se guardan).
2. Pulsa «Medir» y súbete descalzo.
3. Al terminar, «Guardar .FIT» abre el menú de compartir: guárdalo en Drive o envíatelo.
4. En el ordenador: Garmin Connect web > importar datos > sube el `.fit`.

## Desarrollo local (opcional)
- `npm install` y `npm run dev` para ver la interfaz en el navegador (sin Bluetooth).
- `npm run android:sync` y abrir `android/` en Android Studio para compilar en local.

## Notas
- La dirección de la báscula está en `src/App.vue` (`SCALE_MAC`).
- Si Garmin rechazara el archivo, cambia `MANUFACTURER` a `1` en `src/lib/fit.ts`.
- Las fórmulas de composición son las de la comunidad (openScale, bodycomposition): pueden diferir algo de Zepp Life.
