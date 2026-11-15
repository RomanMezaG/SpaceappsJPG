import asyncio
import csv
import os
import rellenar_csv
import preparar_modelo


from collections import deque

from bleak import BleakClient, BleakScanner

import main as lector
import historial
import unir_historial as unificador


# Tiempo de captura de pulso en vivo.
SEGUNDOS_PULSO = 60

# Abre el CSV con Excel u otra aplicación asociada en Windows.
ABRIR_TABLA_AUTOMATICAMENTE = True


async def capturar_pulso():
    print("\nBuscando tu Mi Band 5...")

    encontrados = await BleakScanner.discover(timeout=20)

    dispositivo = next(
        (
            equipo
            for equipo in encontrados
            if equipo.address.lower() == lector.DIRECCION.lower()
        ),
        None,
    )

    if dispositivo is None:
        raise RuntimeError(
            "No se encontró la pulsera. "
            "Acércala y comprueba que Bluetooth esté activado."
        )

    async with BleakClient(dispositivo, timeout=30) as cliente:
        print("Pulsera conectada.")

        clave = lector.solicitar_clave()
        await lector.autenticar(cliente, clave)

        print(
            f"\nRegistrando pulso durante {SEGUNDOS_PULSO} segundos. "
            "La captura terminará automáticamente."
        )

        limite = asyncio.timeout(SEGUNDOS_PULSO)

        try:
            async with limite:
                await lector.leer_pulso(cliente)

        except TimeoutError:
            # Distingue el fin de nuestra captura de otro timeout.
            if not limite.expired():
                raise

            print("\nTiempo de captura completado.")


async def obtener_datos():
    etapas = [
        ("1/3 · Capturando pulso", capturar_pulso),
        ("2/3 · Descargando historiales", historial.ejecutar),
    ]

    for titulo, funcion in etapas:
        print("\n" + "=" * 65)
        print(titulo)
        print("=" * 65)

        try:
            await funcion()

        except Exception as error:
            # Permite consolidar los datos que sí se hayan guardado.
            print(
                f"\nEsta etapa encontró un problema: "
                f"{type(error).__name__}: {error}"
            )
            print(
                "Se continuará con los registros disponibles. "
                "Esta etapa puede haber quedado incompleta."
            )


def mostrar_vista_previa(ruta):
    # Muestra solo las últimas filas en la terminal.
    # El CSV conserva el historial completo.
    with ruta.open(
        "r", newline="", encoding="utf-8-sig"
    ) as archivo:
        lector_csv = csv.DictReader(archivo)
        ultimas = deque(lector_csv, maxlen=15)

    if not ultimas:
        print("La tabla no contiene registros.")
        return

    columnas = [
        ("fecha_utc", "Fecha UTC"),
        ("tipo_registro", "Tipo"),
        ("pulso_bpm", "BPM"),
        ("pasos_minuto", "Pasos/min"),
        ("pasos_acumulados", "Pasos acum."),
        ("calorias_estimadas_acumuladas_kcal", "Kcal acum."),
        ("pai_total", "PAI total"),
        ("estres", "Estrés"),
    ]

    filas = []

    for registro in ultimas:
        fila = []

        for campo, _titulo in columnas:
            valor = registro.get(campo) or "—"

            if campo == "fecha_utc":
                valor = valor[:19].replace("T", " ")

            fila.append(valor)

        filas.append(fila)

    encabezados = [titulo for _campo, titulo in columnas]

    anchos = [
        max(
            len(encabezados[indice]),
            max(len(fila[indice]) for fila in filas),
        )
        for indice in range(len(columnas))
    ]

    def imprimir_fila(valores):
        print(" | ".join(
            valor.ljust(ancho)
            for valor, ancho in zip(valores, anchos)
        ))

    print("\nVista previa: últimos 15 registros\n")
    imprimir_fila(encabezados)
    print("-+-".join("-" * ancho for ancho in anchos))

    for fila in filas:
        imprimir_fila(fila)

def generar_tabla():
    print("\nUniendo los registros...")
    unificador.consolidar()

    print("\nCompletando los espacios vacíos...")
    rellenar_csv.rellenar()

    print("\nPreparando las columnas para el modelo...")
    ruta = preparar_modelo.generar_dataset()

    if ABRIR_TABLA_AUTOMATICAMENTE:
        try:
            os.startfile(str(ruta))
        except OSError:
            print(f"Puedes abrir la tabla manualmente:\n{ruta}")

if __name__ == "__main__":
    try:
        asyncio.run(obtener_datos())

    except KeyboardInterrupt:
        print(
            "\nCaptura interrumpida. "
            "Se intentarán unir los registros que quedaron guardados."
        )

    try:
        generar_tabla()

    except PermissionError:
        print(
            "\nCierra el historial CSV abierto en Excel "
            "y ejecuta python unir_historial.py para actualizarlo."
        )

    except Exception as error:
        print(f"\nNo se pudo generar la tabla: {error}")


