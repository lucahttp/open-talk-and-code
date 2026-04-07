# Requerimientos No Funcionales

## 1. Localización de Dependencias WASM
- **Fecha:** 2026-04-06
- **Fuente:** Optimización de arranque
- **Descripción:** Migrar los archivos del runtime de ONNX a la carpeta `/public` local para evitar fallas de red y latencia de CDNs externos.

## 2. Estabilidad de Concurrencia (Mutex)
- **Fecha:** 2026-04-06
- **Fuente:** Prevención de "Session already started"
- **Descripción:** Implementar un sistema de Mutex (locks) para asegurar que el motor de inferencia ONNX no sea llamado en paralelo por múltiples modelos compartidos.

## 3. Optimización de Memoria (Single-thread WASM)
- **Fecha:** 2026-04-06
- **Fuente:** Prevención de "Memory access out of bounds"
- **Descripción:** Forzar el uso de un solo hilo en WASM y limitar la creación de sesiones para evitar que el navegador agote la memoria RAM asignada al proceso.

## 4. Robustez en Modo Strict
- **Fecha:** 2026-04-06
- **Fuente:** Bug de React Lifecycle
- **Descripción:** Controlar la doble inicialización de modelos y workers provocada por React StrictMode mediante el uso de `useRef` como guardas de estado.
