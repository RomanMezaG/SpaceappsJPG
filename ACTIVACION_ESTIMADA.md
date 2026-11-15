# Activación estimada del prototipo

Versión actual: el perfil se solicita antes de conectar. El divisor fijo 40 de
v1 se sustituye en v2 por 0.35 * (FC máxima de referencia por edad - referencia de
sesión). El flujo y las fórmulas actuales se documentan en PERFIL_Y_SESION.md.
El resto de este documento conserva la descripción inicial v1 como referencia.

El servicio del reloj calcula un indicador experimental con BPM y pasos.
No requiere intervalos RR. No calcula HRV ni reproduce el estrés de Xiaomi.
No determina una causa psicológica ni un estado clínico.

## Funcionamiento

- Recibe resúmenes acumulados de pasos aproximadamente cada 20 segundos.
- Calcula pasos/minuto a partir de diferencias de contadores y tiempos reales,
  utilizando aproximadamente el último minuto. No utiliza los pasos de todo el día
  como si fueran actividad actual.
- Necesita dos resúmenes separados por al menos 15 segundos; el último no puede
  tener más de 45 segundos.
- La referencia es la mediana de al menos 12 lecturas durante 60 segundos con
  cadencia estimada <= 5 pasos/min. El usuario debe permanecer sentado y tranquilo.
  Es una referencia de sesión, no una medición clínica de frecuencia en reposo.
- Suaviza el pulso con la mediana de los últimos 30 segundos (mínimo 5 lecturas).
- Compensación por actividad: min(30, 0.35 * pasos/min), en BPM.
- Exceso: max(0, pulso suavizado - referencia - compensación).
- Objetivo de puntuación: 1 + 9 * min(1, exceso / 40).
- Suavizado adicional exponencial con constante temporal de 15 segundos.
- Salida entre 1 y 10, redondeada a un decimal. Las constantes son decisiones de
  demostración del proyecto, no umbrales clínicos ni parámetros validados.
- Una caída del contador de pasos reinicia la ventana de actividad. Una pausa de
  más de 15 segundos entre pulsos limpia las ventanas de pulso y calibración.
- Cada reconexión del reloj crea una referencia nueva.

## Interfaz y modelo

La tarjeta muestra `activacion_estimada_1_10` y su estado de calibración.
El panel Watch + XGBoost copia esta estimación a `stress_level_1_10`.
No cambia el número ni el orden de las 27 entradas ni reentrena XGBoost.
Las predicciones automáticas esperan a tener la estimación disponible, evitando
usar el 3.2 inicial durante la calibración. El modo manual sigue disponible.

Esta sustitución de una variable por un indicador propio NO acredita equivalencia
con la variable usada en el entrenamiento. Las predicciones que la utilizan son
experimentales y requieren evaluación con datos etiquetados adecuados. La escala
visual se amplía a 10; esto no amplía el rango observado durante el entrenamiento.
Un valor 1 significa poco exceso de pulso según estas reglas, no ausencia de estrés.
Actividad sin pasos, retrasos del contador, respiración y otras causas de cambios
del pulso pueden afectar el resultado.

## Persistencia

Las estimaciones se guardan en `watch/datos/web/activacion_estimada.csv`, con su
fecha, BPM, referencia, cadencia estimada y versión del método. No se rellenan ni
sobrescriben las columnas de estrés medido del historial original.

## Arranque

Reiniciar el servicio del reloj (puerto 8001) y recargar Vite. Al conectar,
permanecer sentado hasta completar la referencia: unos 80 segundos o más desde
el primer resumen de pasos. La web consulta el servicio cada 5 segundos.

No se han ejecutado pruebas ni conexiones Bluetooth automáticamente.
