# Prototipo (referencia visual)

Mockups navegables de las pantallas, hechos en el lienzo de diseño de Claude. Cada `.dc.html` es una pantalla de celular de 390×844: el HTML es la maqueta y el bloque `<script type="text/x-dc">` tiene la lógica de ejemplo (pasos del asistente, validaciones, cálculos).

Usalos para copiar textos, orden de pasos, colores y tamaños. **No son código de producción**: la app real se escribe en React según `../docs/especificacion.md`.

Los datos (nombres, importes, fechas) son inventados.

| Archivo | Pantalla |
| --- | --- |
| Main | Inicio |
| QuienDebe | Quién debe |
| Cliente | Ficha de cliente (límite de fiado, WhatsApp) |
| Plata | Dónde está la plata |
| Ganancia | Ganancia del mes |
| Ideas | Dónde ganar más |
| Mas | Menú Más |
| Viaje | Asistente: anotar viaje |
| Cobro | Asistente: anotar cobro (FIFO, validación) |
| Gasto | Asistente: anotar gasto |
| Liquidacion | Asistente: liquidación al terminar el turno |
| Turnos | Grilla semanal de turnos |
| Vencimientos | Vencimientos y avisos |
