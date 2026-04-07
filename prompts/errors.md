# Registro de Errores Críticos

## 1. No graph was found in the protobuf
- **Fecha:** 2026-04-06
- **Causa:** Archivos ONNX locales corruptos o de 0 bytes (likely por interrupción de descarga).
- **Solución:** Cambiar rutas a URLs remotas estables (HuggingFace) y agregar validación de carga en `ONNXModel`.

## 2. Session already started / Session mismatch
- **Fecha:** 2026-04-06
- **Causa:** Llamadas concurrentes a `session.run()` en ONNX Runtime.
- **Solución:** Implementación de `sessionMutex` global y sistema de bloqueo por sesión en `onnx.js`.

## 3. Memory access out of bounds
- **Fecha:** 2026-04-06
- **Causa:** Saturación de memoria WASM por exceso de hilos y sesiones duplicadas.
- **Solución:** Limitar a 1 hilo (`numThreads: 1`) y centralizar el almacenamiento de sesiones en un `Map` global.

## 4. No session selected (Race Condition)
- **Fecha:** 2026-04-06
- **Causa:** Intento de enviar mensaje inmediatamente después de crear sesión antes de que React actualice el estado.
- **Solución:** Pasar el `sessionId` directamente por parámetros a la función `sendMessage` inyectándolo en el flujo.
