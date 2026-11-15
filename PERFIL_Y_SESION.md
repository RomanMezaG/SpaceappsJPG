# Perfil antes de conectar

## Flujo

Al entrar o recargar la web se muestran tres selectores vacíos: edad (años),
estatura (cm) y peso (kg). No hay un perfil personal predefinido ni se recuperan
valores de localStorage, sessionStorage o cookies. «Continue to mood check-in»
abre las 16 preguntas de EVEA. Cada respuesta se selecciona explícitamente de
0 a 10. «Finish & connect watch» envía el perfil y el formulario se limpia tras
aceptar el servicio. La pestaña EVEA HMM recibe las mismas respuestas y registra
esa evaluación una sola vez. La secuencia EVEA se conserva en memoria durante
la sesión; consultar EVEA_ONBOARDING.md.

Antes del envío no se monta el dashboard ni se inicia Bluetooth. Al enviar se
prepara el acumulador y la importación histórica y se inicia la conexión de la
Mi Band. Después de conectar se realiza la calibración de sesión para los índices.
La entrada directa es Watch + XGBoost; otras entradas del modelo mantienen su
procedencia y no se calculan automáticamente a partir de peso y estatura.

El servicio en 8001 arranca en espera. /api/sesion recibe el perfil validado;
/api/datos requiere X-Watch-Session. La API en 8000 hace de intermediaria. El
token solo está en memoria del navegador. Al salir se intenta cerrar con beacon;
si no llega, el servicio caduca la sesión tras 60 segundos sin señal. La web envía
señal cada 10 segundos mientras está abierta. Una nueva carga de página reinicia
la sesión local anterior. Solo se admite un usuario/sesión de reloj a la vez:
abrir otra pestaña reinicia la conexión anterior. El perfil se vuelve a pedir.
La pérdida de una sesión muestra de nuevo el formulario.

## Uso de los parámetros

- Edad: FC máxima de referencia = 208 - 0.7 * edad. Es la predicción poblacional
  para adultos de Tanaka, no la FC máxima medida de una persona.
  https://pubmed.ncbi.nlm.nih.gov/11153730/
- Reserva de referencia: FC máxima de referencia - pulso de referencia.
- PAI propio v2: (BPM - referencia) / reserva; con pasos >=5/min suma 0.2, 0.5 o
  1 punto/min desde fracciones 0.20, 0.40 y 0.60, respectivamente. Por debajo no suma.
  Estas bandas y puntos son reglas del proyecto, no un algoritmo PAI oficial.
- Activación/entrada de estrés v2: conserva mediana de 30 s y compensación por
  pasos; el exceso se divide entre 0.35 * reserva, en lugar del divisor fijo 40.
  La escala sigue entre 1 y 10. No es una medición de estrés psicológico.
- Estatura: paso aproximado = 0.41 * estatura en metros. Este coeficiente es una
  hipótesis del prototipo pendiente de calibrar con distancia/pasos medidos.
- Peso: energía neta aproximada de caminar en llano = 0.5 * kg * km; se deriva de
  la componente horizontal de la ecuación de caminar ACSM asumiendo 5 kcal/L O2.
  No incluye metabolismo de reposo, pendientes, cargas ni otras actividades.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7896743/

Peso y estatura no se usan para modificar artificialmente el PAI o el estrés: su
papel aquí es distancia y energía de caminata. Cambiar el perfil no garantiza
evitar que el índice llegue a 100; la escala visual conserva el tope solicitado.

## Historial y separación

Los nuevos resultados se guardan en watch/datos/perfiles/<identificador>/, con
versión v2. El identificador es un hash determinista de los parámetros redondeados
a un decimal, no un identificador de persona ni un mecanismo de autenticación.
Dos personas con los mismos parámetros compartirían ese identificador: la app
local está pensada para un único portador del reloj, no para múltiples pacientes.
No se escribe un archivo con los campos personales originales ni se devuelven
esos campos en la telemetría de la interfaz.

Se reutiliza el historial observado de la MAC configurada y se recalcula con el
perfil introducido. Eso presupone que ese historial corresponde al portador:
introducir otro perfil no demuestra quién llevó la pulsera durante la semana.
Los resultados v1 en watch/datos/web se conservan, pero no se suman a los v2.
Con el mismo perfil se recuperan los resultados v2 y se reconstruye la parte
histórica descontando su cobertura en vivo. Con otros parámetros se usa otra carpeta.

## Aplicación del cambio

Reiniciar el servicio del reloj 8001 y la API del modelo 8000, mantener Vite activo
y recargar la página. No se modificaron los archivos .joblib ni sus 27 entradas.
Se revisó el código por lectura; no se ejecutaron pruebas, modelos ni Bluetooth.
