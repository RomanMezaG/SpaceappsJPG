def extraer_rr_ms(paquete):
    """Lee intervalos RR reales del paquete Bluetooth 0x2A37."""
    if len(paquete) < 2:
        raise ValueError("Incomplete heart rate packet.")

    flags = paquete[0]

    # El pulso ocupa uno o dos bytes según el bit 0.
    posicion = 1 + (2 if flags & 0x01 else 1)

    if len(paquete) < posicion:
        raise ValueError("Heart rate value is missing.")

    # Si hay energía acumulada, ocupa otros dos bytes.
    if flags & 0x08:
        posicion += 2
        if len(paquete) < posicion:
            raise ValueError("Incomplete energy field.")

    # Bit 4: presencia de intervalos RR.
    if not flags & 0x10:
        return []

    restantes = len(paquete) - posicion

    if restantes < 2 or restantes % 2:
        raise ValueError("Incomplete RR interval field.")

    intervalos = []

    while posicion < len(paquete):
        ticks = int.from_bytes(
            paquete[posicion:posicion + 2],
            byteorder="little",
        )

        if ticks == 0:
            raise ValueError("RR interval is zero.")

        intervalos.append(ticks * 1000.0 / 1024.0)
        posicion += 2

    return intervalos