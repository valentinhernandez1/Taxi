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

## Pantallas nuevas (`pantallas-nuevas/`)

Diseñadas después, con el mismo estilo: HTML estático de 390×844, sin lógica. Mismo criterio que arriba: son referencia visual y de textos, no código a reutilizar. Datos inventados.

| Archivo | Pantalla |
| --- | --- |
| 01-gastos-del-mes | Gastos del mes (pagado / pendiente, por categoría, aviso de mes incompleto) |
| 02-ficha-movil-2 | Ficha de un coche (resultado antes y después de cuota) |
| 03-choferes-lista | Choferes y ficha con su regla de pago |
| 04-empleados-y-pagos | Empleados, pagos por concepto, aguinaldo estimado |
| 05-ajustes | Ajustes agrupados |
| 06-asistente-anotar-gasto | Asistente: anotar gasto (6 pasos) |
| 07-asistente-pago-empleado | Asistente: pago a un empleado |

Para tener en cuenta al programarlas:

1. **Anotar gasto** no pregunta el día: hay que agregar "¿Qué día?" (como en los otros asistentes). Si se paga con "Recaudación de un chofer", falta preguntar de qué chofer.
2. **Comisión Handy** aparece como categoría para anotar a mano, pero según la especificación se calcula sola al marcar la acreditación de Handy (caso 9). Conviene sacarla del paso 1 del asistente.
3. En las opciones de elegir, el prototipo original avanza al tocar; acá hay un botón "Continuar". Mejor avanzar al tocar, como en cobro y fiado.
4. Los datos de ejemplo no coinciden entre pantallas (el combustible de octubre es del Móvil 1 en Gastos y del Móvil 2 en la ficha); no importa para el diseño.
5. El aguinaldo aparece pagado en octubre; en Uruguay se paga en junio y diciembre. Solo es dato de ejemplo.
