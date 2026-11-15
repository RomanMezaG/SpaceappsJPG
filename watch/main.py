import asyncio
import csv
import getpass
import traceback

from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner
from bleak.exc import BleakError
from Crypto.Cipher import AES


DIRECCION = "F0:D8:99:0D:4E:06"

UUID_AUTH = "00000009-0000-3512-2118-0009af100700"
UUID_PULSO = "00002a37-0000-1000-8000-00805f9b34fb"
UUID_CONTROL = "00002a39-0000-1000-8000-00805f9b34fb"

INTERVALO_MANTENIMIENTO = 12
TIEMPO_SIN_LECTURAS = 90


def solicitar_clave():
    clave_hex = "0xED686366BC19F3F815C95B67A917D9AD"
    return bytes.fromhex(clave_hex[2:])


def obtener_caracteristica(cliente, uuid):
    caracteristica = cliente.services.get_characteristic(uuid)

    if caracteristica is None:
        raise RuntimeError(f"La pulsera no expone la característica {uuid}.")

    return caracteristica


async def escribir(cliente, caracteristica, contenido):
    propiedades = caracteristica.properties

    if "write" in propiedades:
        respuesta = True
    elif "write-without-response" in propiedades:
        respuesta = False
    else:
        raise RuntimeError(
            f"La característica {caracteristica.uuid} no permite escritura."
        )

    await cliente.write_gatt_char(
        caracteristica,
        contenido,
        response=respuesta,
    )


async def autenticar(cliente, clave):
    caracteristica = obtener_caracteristica(cliente, UUID_AUTH)
    respuestas = asyncio.Queue()

    def recibir_respuesta(_caracteristica, datos):
        respuestas.put_nowait(bytes(datos))

    print("Activando notificaciones de autenticación...")
    await cliente.start_notify(caracteristica, recibir_respuesta)

    try:
        print("Solicitando desafío de autenticación...")
        await escribir(cliente, caracteristica, b"\x02\x00")

        try:
            async with asyncio.timeout(30):
                while True:
                    paquete = await respuestas.get()
                    encabezado = paquete[:3]

                    if encabezado == b"\x10\x02\x01":
                        desafio = paquete[3:]

                        if len(desafio) != 16:
                            raise RuntimeError(
                                "El desafío recibido no tiene 16 bytes."
                            )

                        cifrador = AES.new(clave, AES.MODE_ECB)
                        respuesta = cifrador.encrypt(desafio)

                        print("Enviando respuesta al desafío...")
                        await escribir(
                            cliente,
                            caracteristica,
                            b"\x03\x00" + respuesta,
                        )

                    elif encabezado == b"\x10\x03\x01":
                        print("Autenticación aceptada por la pulsera.")
                        return

                    elif encabezado == b"\x10\x03\x04":
                        raise RuntimeError(
                            "La pulsera rechazó la AuthKey. "
                            "Puede ser una clave antigua o de otra vinculación."
                        )

                    elif encabezado == b"\x10\x02\x04":
                        raise RuntimeError(
                            "La pulsera rechazó la solicitud del desafío."
                        )

                    else:
                        raise RuntimeError(
                            "Respuesta de autenticación no reconocida: "
                            + encabezado.hex()
                        )

        except TimeoutError:
            raise RuntimeError(
                "La autenticación no respondió en 30 segundos. "
                "Comprueba que la pulsera siga conectada."
            ) from None

    finally:
        if cliente.is_connected:
            with suppress(BleakError, TimeoutError):
                await cliente.stop_notify(caracteristica)


def interpretar_pulso(paquete):
    if len(paquete) < 2:
        raise ValueError("Paquete de pulso demasiado corto.")

    indicadores = paquete[0]
    longitud = 2 if indicadores & 0x01 else 1

    if len(paquete) < 1 + longitud:
        raise ValueError("Paquete de pulso incompleto.")

    pulso = int.from_bytes(paquete[1:1 + longitud], "little")

    contacto = "No informado"
    if indicadores & 0x04:
        contacto = "Sí" if indicadores & 0x02 else "No"

    return pulso, contacto


async def leer_pulso(cliente, publicar=None, actualizar=None):
    medida = obtener_caracteristica(cliente, UUID_PULSO)
    control = obtener_caracteristica(cliente, UUID_CONTROL)
    lecturas = asyncio.Queue()

    def recibir_pulso(_caracteristica, datos):
        fecha = datetime.now(timezone.utc).isoformat()
        lecturas.put_nowait((fecha, bytes(datos)))

    suscrito = False
    medicion_solicitada = False

    try:
        print("Preparando medición del pulso...")

        await escribir(cliente, control, b"\x15\x02\x00")
        await escribir(cliente, control, b"\x15\x01\x00")

        print("Activando notificaciones del pulso...")
        await cliente.start_notify(medida, recibir_pulso)
        suscrito = True

        print("Solicitando medición continua...")
        medicion_solicitada = True
        await escribir(cliente, control, b"\x15\x01\x01")

        carpeta = Path(__file__).resolve().parent / "datos"
        carpeta.mkdir(exist_ok=True)

        nombre = datetime.now().strftime(
            "pulso_%Y%m%d_%H%M%S_%f.csv"
        )
        archivo = carpeta / nombre

        with archivo.open(
            "w", newline="", encoding="utf-8"
        ) as salida:
            escritor = csv.writer(salida)
            escritor.writerow([
                "fecha_recepcion_utc",
                "direccion",
                "pulso_bpm",
                "contacto",
                "paquete_hex",
            ])
            salida.flush()

            print(f"Guardando lecturas en: {archivo}")
            print("Coloca bien la pulsera en tu muñeca.")

            reloj = asyncio.get_running_loop()
            ultima_lectura = reloj.time()
            ultimo_mantenimiento = reloj.time()

            while True:
                if not cliente.is_connected:
                    raise RuntimeError(
                        "La pulsera se desconectó."
                    )

                # Permite al servidor consultar pasos,
                # distancia y calorías cuando corresponda.
                if actualizar is not None:
                    await actualizar(cliente)

                ahora = reloj.time()

                if (
                    ahora - ultimo_mantenimiento
                    >= INTERVALO_MANTENIMIENTO
                ):
                    await escribir(cliente, control, b"\x16")
                    ultimo_mantenimiento = reloj.time()

                if (
                    reloj.time() - ultima_lectura
                    > TIEMPO_SIN_LECTURAS
                ):
                    raise RuntimeError(
                        "No se recibieron lecturas válidas durante "
                        f"{TIEMPO_SIN_LECTURAS} segundos."
                    )

                try:
                    fecha, paquete = await asyncio.wait_for(
                        lecturas.get(),
                        timeout=1,
                    )
                except TimeoutError:
                    continue

                try:
                    pulso, contacto = interpretar_pulso(paquete)
                except ValueError as error:
                    print(f"Paquete descartado: {error}")
                    continue

                ultima_lectura = reloj.time()

                escritor.writerow([
                    fecha,
                    DIRECCION,
                    pulso,
                    contacto,
                    paquete.hex(),
                ])
                salida.flush()

                # Envía la lectura al servidor para mostrarla
                # en la aplicación React.
                if publicar is not None:
                    publicar(fecha, pulso)

                print(f"{fecha} | Pulso: {pulso} BPM")

    finally:
        if cliente.is_connected:
            if medicion_solicitada:
                with suppress(BleakError, TimeoutError):
                    await escribir(
                        cliente,
                        control,
                        b"\x15\x01\x00",
                    )

            if suscrito:
                with suppress(BleakError, TimeoutError):
                    await cliente.stop_notify(medida)

async def main():
    clave = solicitar_clave()

    print("\nBuscando tu Mi Band 5...")
    encontrados = await BleakScanner.discover(timeout=20)

    dispositivo = next(
        (
            encontrado
            for encontrado in encontrados
            if encontrado.address.lower() == DIRECCION.lower()
        ),
        None,
    )

    if dispositivo is None:
        raise RuntimeError(
            "No se encontró tu Mi Band 5. "
            "Acércala, enciende su pantalla y comprueba Bluetooth."
        )

    print(f"Conectando a {dispositivo.address}...")

    async with BleakClient(dispositivo, timeout=30) as cliente:
        print("Conexión establecida.")
        await autenticar(cliente, clave)
        await leer_pulso(cliente)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nPrograma terminado. Las lecturas recibidas quedaron guardadas.")
    except Exception:
        traceback.print_exc()