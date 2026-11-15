# Puntos de actividad del prototipo

La versión actual pide un perfil antes de conectar. Las reglas v2 usan la edad
para la reserva cardíaca y guardan los resultados por perfil. Ver
PERFIL_Y_SESION.md para el flujo y las fórmulas actuales. Las reglas v1 descritas
abajo documentan los resultados anteriores, conservados en su carpeta original.

Se muestran como «PAI», en una escala entera de 1 a 100, con el índice de hoy más
los seis días anteriores como valor principal y el índice de hoy debajo. Se usa
la fecha local de Windows. Es
la puntuación propia del prototipo. No es el PAI de Xiaomi ni
un indicador clínicamente validado. No se deben aplicar objetivos del PAI oficial.
No se envía a XGBoost.

## Escala visual de 1 a 100

Se aplica a los puntos originales: redondear(1 + 99 * min(1, puntos / 100)),
con redondeo de mitades hacia arriba. Cero puntos se muestra como 1; 100 puntos
o más se muestra como 100. Es una referencia de interfaz propia, no una meta
clínica ni equivalencia con el PAI oficial. Un índice 1 no acredita inactividad
si faltan datos. Sin historial cargado se muestra ausencia de datos, no 1.
Los campos pai_indice_hoy y pai_indice_7dias contienen los índices. Los campos
pai_prototipo_hoy y pai_prototipo_7dias conservan los puntos sin normalizar,
incluidos los que superen 100; los CSV originales de contribuciones no cambian.

## Reglas de demostración (actividad_relativa_v1)

Se reutiliza la referencia de pulso de la sesión creada por activacion.py. Tras
la calibración, el aumento relativo es (BPM - referencia) / referencia.

| Condición | Puntos por minuto |
| --- | ---: |
| Menos de 5 pasos/min o aumento menor de 15 % | 0 |
| Aumento desde 15 % y menor de 35 % | 0.2 |
| Aumento desde 35 % y menor de 60 % | 0.5 |
| Aumento de 60 % o más | 1.0 |

Son coeficientes elegidos para demostrar el flujo, no umbrales científicos.
Ejemplo teórico: 30 minutos continuos en la banda de 0.2 puntos/min aportan 6
puntos; las transiciones y pérdidas de datos pueden reducir ese total.

Solo se cuentan intervalos entre lecturas válidas consecutivas de como máximo
15 segundos. En cada intervalo se utiliza la menor tasa de sus extremos. Los
intervalos que cruzan medianoche se reparten por día. El pulso elevado sin pasos
no añade puntos con estas reglas; esto también excluye ciclismo, ejercicio sin
pasos y actividad en microgravedad, y requiere otra definición para esos casos.

## Persistencia y reinicios

Cada intervalo se guarda en watch/datos/web/pai_prototipo.csv, con método, fecha,
referencia, BPM, cadencia y puntos. Al iniciar se recuperan los totales. Una
reconexión reinicia la referencia y la continuidad, pero conserva los puntos.
La captura en vivo no suma tiempo con el programa cerrado. La importación inicial
puede recuperar periodos que sí quedaron medidos por el reloj en el CSV. No se
rellenan periodos sin datos ni se copia el PAI del fabricante.
Si hay un error al cargar el historial, se muestra el error y no se sustituye por
un cero. No iniciar varios servicios del reloj escribiendo en el mismo archivo.

Algunas pausas o pérdidas entre paquetes pueden pasar inadvertidas dentro del
límite de 15 segundos. Los pasos son un resumen periódico y pueden tener retraso.
Un reinicio del reloj de Windows o una calibración inadecuada afecta el cálculo.

Implementación revisada por lectura; no se ejecutaron pruebas ni Bluetooth.

## Importación del historial observado (historico_v1)

Al arrancar se consolida el historial y, antes de conectar Bluetooth, se procesa
watch/datos/historial_completo.csv para la MAC configurada en watch/main.py.
Se requieren columnas de tipo y procedencia del consolidado original; no se
utiliza dataset_modelo.csv ni historial_completo_rellenado.csv.

Se agrupan muestras por minuto UTC. Se exige un registro actividad_minuto con
pasos observados y al menos un BPM válido del mismo minuto. Se pueden usar BPM
de actividad, pulso manual o pulso en vivo. Se eliminan repeticiones exactas de
fecha/BPM y se obtiene la mediana; los contadores de pasos contradictorios causan
que el minuto se omita. No se interpolan pulsos ni se sustituyen pasos ausentes.
Solo se admiten minutos completos del intervalo de siete fechas locales.

La referencia retrospectiva de cada día es la mediana de al menos 30 minutos
válidos con <= 5 pasos/min. Se excluyen de esa referencia los registros con tipo
raw 120 (0x78, marcador de sueño usado por el lector). No se afirma que los demás
minutos correspondan a reposo real. Sin referencia suficiente, se omite ese día.
Esta referencia diaria difiere de la calibración de sesión utilizada en vivo.
No usar estos resultados retrospectivos como entradas de una evaluación temporal
de ML sin controlar el uso de datos posteriores al instante de cada predicción.

Se utilizan las mismas tasas de puntos, ponderadas por la duración disponible
de cada minuto. Se descuenta la unión de los intervalos ya registrados en vivo,
incluidos los que aportaron cero puntos. La cobertura restante se considera una
aproximación por minuto, no una observación continua de cada segundo.

Los resultados se reconstruyen en watch/datos/web/pai_historico.csv mediante un
temporal y reemplazo. No se añaden otra vez al archivo anterior. Se conservan
separados del ledger en vivo; el total visible suma ambos. Reiniciar con el mismo
CSV y la misma cobertura no duplica contribuciones. Si el CSV recibe nuevos datos,
se actualiza al próximo arranque; no se reimporta durante la sesión Bluetooth.
La referencia diaria y la cifra reconstruida pueden cambiar con nuevos registros.

watch/datos/web/pai_importacion.json guarda fecha de importación, origen, método,
minutos completos/importados/omitidos y referencias por día. Cada contribución
CSV conserva MAC, minuto, duración, tiempo descontado, BPM, referencia y pasos.
Si falla la importación se conservan los puntos importados previamente y la web
muestra el motivo. Los CSV de lecturas originales no se modifican.
