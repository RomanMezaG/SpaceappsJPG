# Historial integrado de indicadores

La tabla de la web y el botón «Descargar CSV» utilizan ahora
watch/datos/perfiles/<perfil_id>/historial_sesion.csv. Se añade una fila por
lectura de pulso procesada. Con el mismo perfil se conserva el mismo archivo.

## Columnas

- fecha_utc: instante UTC en que se reúne la fila del historial integrado.
- pulso_bpm: lectura de la pulsera; pulso_fecha_utc conserva su recepción original.
- pasos_minuto: cadencia calculada por diferencias de los resúmenes de pasos.
- pasos_acumulados: último contador diario de la pulsera disponible.
- distancia_calculada_m y calorias_caminata_kcal: cálculo con el perfil de sesión.
- pai_hoy_1_100 y pai_7dias_1_100: índices propios acumulados, escala 1 a 100.
- estres_1_10: índice propio calculado con BPM/actividad, no estrés del fabricante.
- resumen_fecha_utc: fecha de la consulta que proporcionó pasos/distancia/energía.
- estado_calculo: estado de calibración/disponibilidad para interpretar ausencias.
- perfil_id, metodo_activacion y metodo_pai: procedencia y versión del cálculo.

El resumen de pasos se consulta aproximadamente cada 20 s. Se permite utilizar el
último durante 45 s, conservando su fecha: repetir un contador en varias filas
no significa que se hayan dado esos pasos en cada intervalo. Los contadores y
calorías acumuladas no deben sumarse entre filas para calcular actividad diaria.

## Datos ausentes

No se rellenan mediciones que no existen. Durante la calibración falta el índice
de estrés; sin resúmenes recientes faltan pasos, distancia y energía. La tabla
muestra «Calibrando» cuando corresponde. El CSV conserva esas ausencias junto
con el estado del cálculo. Los ceros válidos se guardan y muestran como cero.

historial_completo.csv sigue siendo el historial original de eventos del reloj,
utilizado para reconstruir PAI. No se sobrescribe ni se fabrican valores para sus
registros anteriores. Las nuevas filas integradas se generan después de aplicar
el cambio y conectar el perfil. La tabla muestra las últimas 10 de las últimas
120 filas recibidas; la descarga contiene el archivo integrado completo del perfil.

## Descarga

La web solicita GET /api/watch/history.csv con su sesión activa. La API del
modelo delega en GET /api/historial.csv del servicio del reloj. El navegador
descarga historial_sesion.csv. El CSV usa coma y UTF-8 con BOM para Excel.
Las fechas del archivo son UTC; la tabla muestra fecha/hora local con segundos.

Se revisó por lectura; no se ejecutaron pruebas ni conexiones Bluetooth.
