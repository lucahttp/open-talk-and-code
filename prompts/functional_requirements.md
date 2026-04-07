# Requerimientos Funcionales

## 1. Detección de Wake Word ("Hey Buddy")
- **Fecha:** 2026-04-06
- **Fuente:** Usuario / Pipeline Voice-to-Voice
- **Descripción:** Implementar y refinar la detección de palabras clave para activar el agente. Se corrigió la lógica de escucha para que sea secuencial y no colapse el procesador.

## 2. Pipeline de Voz a Voz (STT -> LLM -> TTS)
- **Fecha:** 2026-04-06
- **Fuente:** Usuario / Arquitectura base
- **Descripción:** Asegurar que el audio capturado por el micrófono llegue al transcriptor (Whisper), se envíe al backend (OpenCode) y la respuesta sea dictada por el sintetizador (TTS).

## 3. Gestión de Sesiones On-the-fly
- **Fecha:** 2026-04-06
- **Fuente:** Debugging de flujo de usuario
- **Descripción:** Implementar el flujo de creación de sesión automática cuando el usuario habla sin una sesión activa, pasando el mensaje original sin perder información.

## 4. Filtro de Hallucinaciones de Audio
- **Fecha:** 2026-04-06
- **Fuente:** Errores detectados en Whisper
- **Descripción:** Filtrar frases fantasma como "(speaking in foreign language)" o "[music]" generadas por Whisper en momentos de silencio.
