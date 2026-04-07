# Evolución de la Arquitectura (High Level)

## Fase 1: Arquitectura Distribuida (Initial)
- **Estado:** Inestable
- **Características:**
    - Múltiples hooks (`useHeyBuddy`, `useModelLoader`) creando instancias independientes de los mismos modelos.
    - Dependencia total de CDNs externos para archivos WASM y JS.
    - Sin control de concurrencia; el micrófono mandaba ráfagas de audio que colapsaban el motor ONNX.
    - Flujo de mensajes legado mezclado con la nueva máquina de estados.

## Fase 2: Arquitectura Sincronizada (Intermediate)
- **Estado:** Funcional pero frágil
- **Características:**
    - Introducción de `MutexLock` local en los modelos para evitar choques básicos.
    - Migración de dependencias críticas a local (`/public/wasm`).
    - Implementación de periodos de gracia y buffers de audio controlados.
    - Detección de problemas de memoria en WASM.

## Fase 3: Arquitectura Centralizada (Final)
- **Estado:** Estable
- **Características:**
    - **SessionManager (Global):** Centralización de todas las sesiones ONNX en `onnx.js` usando un caché global. Ningún modelo se carga dos veces.
    - **Global Mutex:** Un semáforo único por modelo asegura que ni siquiera diferentes instancias del código se pisen al ejecutar inferencia.
    - **Single-thread WASM:** Configuración determinista de hilos para evitar fugas de memoria en el navegador.
    - **Inyección de Dependencia en Flujo:** Bypass del estado de React para envíos críticos de mensajes post-creación de sesión.
    - **Pipeline Clean-up:** Eliminación definitiva de lógica redundante en `App.jsx`, dejando la máquina de estados como única fuente de verdad.
