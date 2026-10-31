# Especificación del MVP — Sistema de gestión de taxis

Versión acordada el 18 de octubre de 2026 (propuesta original en Claude Docs). Este archivo es la fuente de verdad para programar.

## 1. Resumen y decisiones

El MVP es una app web para el celular que usa solo el dueño para pasar los papeles de la base y saber, sin revisar nota por nota, quién debe, dónde está la plata y si la empresa gana o pierde.

**Situación actual:** los fiados se anotan en una hoja de papel por cliente (día, chofer, importe); los pagos se restan y la hoja se tira cuando el cliente salda. La plata queda con quien la recibe y los gastos casi no se registran. No hay historial ni forma de saber la ganancia real.

**Decisiones tomadas**

1. La app la usa solo el dueño. El papel sigue en la base y él carga los datos.
2. Cada cliente tiene una cuenta corriente: los viajes fiados se suman y los pagos van contra el total. Internamente se imputan primero a la deuda más vieja.
3. No hay vencimientos fijos para fiados: se muestra la antigüedad, con alertas configurables y plazo opcional por cliente.
4. Cada cobro registra quién recibió la plata, el medio (efectivo o transferencia) y dónde quedó.
5. La plata está en cuatro lugares: caja del dueño, banco, a acreditar por Handy y pendiente de entregar por cada persona.
6. Liquidación de choferes configurable por chofer, **anotada una sola vez al terminar cada turno**.
7. Gastos con estado pagado o pendiente, gastos fijos recurrentes, gastos por coche, cuotas de coches, pagos a empleados, impuestos y servicios con avisos de vencimiento.
8. Turnos básicos: plantillas, grilla semanal, cambio rápido de chofer, repetir semana.
9. Las deudas actuales en papel se cargan en detalle, marcadas como carga inicial.
10. Interfaz guiada, una pregunta por pantalla, primero celular, siempre conectada, hosting gratuito con copias propias.
11. La app muestra cuánto deja el negocio y dónde ganar más, con sugerencias calculadas.

## 2. Alcance

| Módulo | Entra en el MVP | Queda para después |
| --- | --- | --- |
| Clientes y fiados | Ficha, viajes fiados, saldo, antigüedad, alertas, búsqueda, carga inicial, límite de fiado, recordatorio por WhatsApp | — |
| Cobros | Pago total o parcial contra la cuenta, quién recibió, medio, imputación FIFO, validaciones | Recibo en PDF |
| Viajes | Carga guiada en tanda (efectivo, tarjeta, fiado), chofer, coche, fecha | Origen y destino |
| Plata y caja | Saldos por lugar, entregas con diferencias, acreditaciones de Handy | Conciliación automática con Handy |
| Liquidación | Reglas por chofer, liquidación al terminar cada turno, adelantos sobre fiados | Recibos de sueldo |
| Gastos | Puntuales y fijos, pagado o pendiente, categorías configurables, comisión Handy, gastos y cuotas por coche, pagos a empleados, aguinaldo estimado, BPS/DGI/OSE/UTE/Antel, avisos | Foto del comprobante |
| Turnos | Choferes, coches, plantillas, grilla semanal, cambio rápido, repetir semana, detección de huecos y superposiciones | Arrastrar y soltar, horas por chofer |
| Panel e informes | Inicio, Ganancia, Dónde ganar más, flujo de caja, aviso de días sin cargar, exportar a Excel/CSV, llamadas perdidas | Gráficos de tendencia |
| Base | Login del dueño, ajustes, auditoría, copias diarias | Usuarios para telefonista y choferes (dejar el modelo preparado) |

Todo lo configurable va en Ajustes: coches, choferes, clientes, reglas de liquidación, plantillas de turno, categorías, gastos fijos y vencimientos, formas de pago, umbrales de alertas, comisión Handy, moneda.

## 3. Flujos (asistentes de una pregunta por pantalla)

Cada asistente termina en un resumen en lenguaje claro ("Rodríguez pagó $ 600 en efectivo a Juan. Le quedan $ 200.") con Guardar / Corregir, y donde aplica "Guardar y anotar otro" manteniendo fecha y chofer.

1. **Anotar viaje:** ¿Qué día? (Hoy / Ayer / días recientes / calendario, marcando días sin cargar) → ¿Qué chofer? → ¿Cuánto? (teclado numérico) → ¿Cómo pagó? (Efectivo / Tarjeta / Fiado) → si fiado, ¿Quién? (buscador con saldo, o cliente nuevo; avisa si supera el límite) → resumen. El coche se completa según el turno asignado; si no hay turno, se pregunta.
2. **Anotar cobro:** ¿Quién pagó? (con saldo) → ¿Cuánto? (botón "Pagó todo"; rechaza más que el saldo) → ¿Cómo? (Efectivo / Transferencia) → si efectivo, ¿Quién recibió? (dueño, telefonista, chofer) → ¿Qué día? → resumen mostrando a qué viajes se aplica (FIFO) y cuánto queda.
3. **Anotar gasto:** ¿Qué gasto? (categorías) → si es de coche, ¿Qué coche? → ¿Cuánto? → ¿Ya está pagado? → si pagado, ¿Con qué plata? (caja, banco, recaudación de un chofer) → resumen explicando el efecto.
4. **Anotar liquidación (al terminar el turno):** ¿Qué chofer terminó? (solo los que terminaron turno) → ¿Están todos los viajes? (resumen efectivo / tarjeta / fiado para comparar con el papel; si faltan, ir a anotarlos) → ¿Pagó algo con la plata del turno? (combustible, otro, nada) → la cuenta calculada según su regla ("Te tiene que entregar $ X" o "Le tenés que pagar $ X") → ¿Cuánto entregó? (botón "Entregó justo"; registra diferencias) → resumen y guardar. Después solo se modifica con motivo.
5. **Recibir plata de alguien:** lista "Quién tiene plata" con saldo y antigüedad → registrar entrega; si no coincide, nota y diferencia registrada.
6. **Handy:** pendiente de acreditar → "Ya cayó al banco" con el importe real; la diferencia es comisión o faltante.
7. **Carga inicial de hojas de fiados:** cliente → renglones (fecha, chofer o "Chofer anterior", importe) y pagos anotados → confirmar que el total coincide con la hoja.
8. **Vencimientos:** lista de lo que vence en 30 días, vencido arriba en rojo; botones "Ya lo pagué" (genera el gasto) y "Avisame mañana".
9. **Turnos:** grilla día × coche × turno; tocar una tarjeta abre la elección de chofer o "Dejar sin chofer"; avisos de huecos y de chofer con dos turnos el mismo día; "Repetir la semana anterior".

## 4. Reglas de negocio

### Tres números que nunca se mezclan
1. **Facturación** = suma de viajes del período por fecha del viaje, cualquiera sea la forma de pago. Excluye carga inicial.
2. **Cobrado** = plata efectivamente recibida: viajes en efectivo, tarjeta acreditada y cobros de fiados, por fecha de cobro.
3. **Ganancia** = facturación − gastos devengados (pagados o pendientes) − parte de los choferes. Se muestra junto al flujo de caja (cobrado − gastos pagados − pagos a choferes).

### Fiados y cobros
1. Un viaje fiado genera deuda por su importe; nunca cuenta como cobrado.
2. Saldo del cliente = viajes fiados − pagos aplicados. No se edita.
3. El pago se imputa FIFO; el importe original del viaje no cambia.
4. Pago mayor al saldo → rechazado; solo con confirmación explícita queda saldo a favor.
5. Importe cero, negativo o con más de 2 decimales → rechazado.
6. Antigüedad = días desde el fiado más viejo con saldo. Alertas amarilla y roja con días configurables (por defecto 30 y 60).
7. Límite de fiado opcional por cliente: aviso antes de anotar un fiado que lo supere.
8. Recordatorio por WhatsApp: enlace `wa.me` con el mensaje armado; lo envía el dueño. Se registra la fecha del recordatorio.

### Dónde está la plata
1. Efectivo recibido por una persona → su saldo a entregar, hasta registrar la entrega.
2. Transferencia → banco.
3. Tarjeta → a acreditar por Handy, hasta marcarse acreditada.
4. Gasto pagado con plata de alguien → resta de ese lugar.
5. Entrega distinta de lo esperado → diferencia registrada con nota.

### Liquidación (configurable por chofer, con vigencia)
1. Forma de cobro: porcentaje, jornal, sueldo o mixto.
2. Entrega: entrega todo y se le paga, o se queda con su parte.
3. Fiados: su parte se paga en la liquidación (A, adelanto) o cuando el cliente paga (B).
4. Fiado incobrable: lo absorbe la empresa o se descuenta al chofer.
5. Adelantos sobre fiados no cobrados se muestran aparte.
6. Regla no confirmada → marca "sin confirmar".
7. Se liquida por turno. Si lo esperado da negativo, la empresa le paga al chofer.

### Gastos
1. Pendiente cuenta para la ganancia del mes pero no es salida de caja hasta pagarse.
2. Gastos fijos y obligaciones generan su vencimiento según frecuencia (mensual, bimestral, anual, meses específicos) y día; importe fijo o estimado, se confirma el real.
3. Comisión Handy como gasto con % configurable, ajustada con lo acreditado.
4. Gastos por coche: combustible, taller, repuestos, gomería, seguro, patente, cuotas. Resultado por coche = facturación del coche − parte de choferes − gastos de funcionamiento; las cuotas se muestran debajo, aparte.
5. Gastos generales (BPS, teléfono, POS) no se reparten entre coches.
6. Pagos a empleados por concepto (sueldo, jornal, adelanto, aguinaldo, salario vacacional). Aguinaldo estimado acumulado por semestre (junio y diciembre), marcado "estimado"; lo confirma el contador. La app no inventa fechas oficiales de BPS/DGI.

### Avisos
1. Por defecto 3 días antes y el mismo día; configurables por obligación.
2. Canales gratuitos: lista en el panel, Web Push y email diario opcional.
3. Sirven también para cuotas, deudas en rojo y personas sin rendir.
4. En iPhone, Web Push requiere la app agregada a la pantalla de inicio.

### Dónde ganar más
Pantalla **Ganancia** (por mes completo): cuánto quedó; de cada $ 100 facturados cuánto va a choferes, coches, generales y cuánto queda; punto de equilibrio diario contra lo real; resultado por coche antes y después de cuota; promedio por turno día/noche y turnos sin chofer; facturado − fiados nuevos + fiados cobrados (si la deuda crece).

Pantalla **Dónde ganar más** — reglas que generan sugerencias con su importe estimado y de dónde sale:

| Detecta | Sugerencia | Cálculo |
| --- | --- | --- |
| Turnos sin chofer | Cubrí las noches del Móvil 2 | Turnos vacíos × promedio del turno × margen después de chofer y combustible |
| Deuda que crece o envejece | Cobrá los fiados viejos | Deuda > 30 días; fiados nuevos vs. cobrados del mes |
| Coche que gasta de más | Revisá el Móvil 2 | Taller y combustible como % de lo facturado, entre coches y vs. meses anteriores |
| Vencimientos atrasados | Pagá a tiempo | Obligaciones vencidas sin pagar |
| Gasto que sube | El combustible subió 15 % | Categoría vs. promedio de los 3 meses anteriores |
| Viajes perdidos | Falta un coche los viernes de noche | Llamadas sin coche anotadas por día y hora |

Las sugerencias son información: se marcan como hechas o se descartan. Solo con meses completos; si faltan datos, se avisa.

### Integridad
1. Nada confirmado se borra: se anula con motivo, fecha y quién; los movimientos se revierten con movimientos inversos.
2. Toda corrección deja historial (antes, después, motivo).
3. `op_key` único por operación.
4. Datos incompletos → aviso "incompleto".

## 5. Modelo de datos

El dinero son movimientos entre cuentas; los saldos son vistas, nunca columnas editables.

| Tabla | Para qué | Campos principales |
| --- | --- | --- |
| usuario | Login | id, email, hash_password, rol, activo |
| persona | Choferes, telefonista, dueño | id, nombre, telefono, tipo, activo |
| coche | Flota | id, nombre_movil, matricula, activo |
| cliente | Clientes con fiado | id, nombre, telefono, observaciones, plazo_dias, limite_fiado, ultimo_recordatorio, activo |
| viaje | Cada viaje | id, fecha, importe, forma_pago, chofer_id, coche_id, turno_id, cliente_id, recibido_por_id, origen (normal, carga_inicial), op_key, anulado |
| cobro | Pago de un cliente | id, cliente_id, fecha, importe, medio, recibido_por_id, op_key, anulado |
| imputacion | Cobro aplicado a viajes | cobro_id, viaje_id, importe |
| cuenta | Lugares de la plata | id, tipo (caja, banco, handy, a_entregar, externo), persona_id |
| movimiento | Toda entrada, salida o pase | id, fecha, importe, cuenta_desde, cuenta_hacia, tipo, origen_tabla, origen_id, op_key, anulado |
| entrega | Rendición al dueño | id, persona_id, fecha, esperado, entregado, diferencia, nota |
| acreditacion_handy | Tarjeta que cayó al banco | id, fecha, importe_esperado, importe_acreditado, viajes |
| categoria_gasto | Configurable | id, nombre, es_de_coche, activa |
| gasto_fijo | Plantilla recurrente | id, categoria_id, coche_id, descripcion, importe, frecuencia, meses, dia_del_mes, importe_estimado, cuotas_total, fecha_fin, es_cuota_vehiculo, dias_aviso, activo |
| vencimiento | Instancia de un período | id, gasto_fijo_id, periodo, fecha_vence, importe_estimado, importe_real, estado, gasto_id |
| gasto | Gasto concreto | id, fecha, importe, categoria_id, coche_id, descripcion, estado, fecha_pago, pagado_desde, gasto_fijo_id, op_key, anulado |
| pago_empleado | Sueldos, aguinaldo, adelantos | id, persona_id, concepto, periodo, importe, fecha, pagado_desde, op_key, anulado |
| regla_liquidacion | Arreglo por chofer con vigencia | id, chofer_id, tipo, porcentaje, jornal, modo_entrega, momento_fiado, incobrable, confirmada, vigente_desde |
| liquidacion | Cierre de un turno | id, chofer_id, turno_id, facturado, parte_chofer, adelantos_fiado, gastos, esperado, entregado, diferencia, estado |
| plantilla_turno | Configurable | id, nombre, hora_inicio, hora_fin, color |
| turno | Asignación | id, fecha, coche_id, chofer_id, plantilla_id, sustituye_a_id |
| llamada_perdida | Viajes no atendidos | id, fecha, hora, nota |
| sugerencia_estado | Hecha o descartada | id, clave, periodo, estado |
| aviso | Notificaciones | id, tipo, referencia, fecha_aviso, enviado, posponer_hasta |
| suscripcion_push | Dispositivo del dueño | id, endpoint, claves |
| ajuste | Parámetros | clave, valor |
| auditoria | Historial | id, tabla, registro_id, accion, antes, despues, motivo, usuario_id, fecha |

Decisiones: cada operación financiera crea registro + movimientos en una transacción; la auditoría se escribe desde servicios (para guardar el motivo); vistas `saldo_cliente`, `deuda_por_antiguedad`, `saldo_por_cuenta`, `resumen_periodo`, `resultado_por_coche`.

## 6. Pantallas

Ver `prototipo/` (mockups navegables, 390×844). Inicio · Deben (Quién debe) · Ficha de cliente · Plata · Ganancia · Más · Anotar viaje · Anotar cobro · Anotar gasto · Anotar liquidación · Turnos · Vencimientos · Dónde ganar más. Faltan diseñar: gastos del mes, ficha de coche, choferes, empleados, ajustes, carga inicial.

Criterios: barra inferior con 5 pestañas (Inicio, Deben, Plata, Ganancia, Más); botón principal abajo, ancho completo; letra base 18 px; botones ≥ 48 px; contraste AA; colores con significado único (verde bien, amarillo atención, rojo urgente); en computadora las listas pasan a tablas con filtros; mensajes que dicen qué hacer; tipografía Atkinson Hyperlegible; azul principal `#0B57A4`.

## 7. Arquitectura

Ver `CLAUDE.md` (stack). Backend: rutas (validan) → servicios (reglas, transacción, movimientos, auditoría) → repositorio. Reglas de dinero (FIFO, liquidaciones, saldos, sugerencias) como funciones puras en `packages/shared` con pruebas propias. Seguridad: HTTPS, límite de intentos de login, secretos fuera del repo, datos reales solo en producción.

## 8. Plan por etapas

1. ~~Prototipo navegable~~ (hecho).
2. **Base del proyecto:** repo, base, migraciones, login, ajustes, auditoría, copias diarias y restauración probada. *Listo cuando:* se restaura una copia en una base vacía.
3. **Clientes, fiados y cobros** + carga inicial. *Listo cuando:* pasan las pruebas de fiados y dos hojas reales de prueba coinciden con el papel.
4. **Uso real 1:** el dueño usa fiados y cobros.
5. **Viajes y plata:** viajes, cuentas, entregas, Handy.
6. **Gastos:** categorías, fijos, por coche, cuotas, empleados, vencimientos y avisos.
7. **Liquidación** al terminar cada turno, todas las combinaciones de reglas probadas.
8. **Panel, Ganancia, Dónde ganar más**, exportación, llamadas perdidas.
9. **Turnos básicos.**
10. **Uso real 2.**

## 9. Casos de prueba obligatorios

| # | Caso | Datos | Esperado |
| --- | --- | --- | --- |
| 1 | Fiado no es cobro | Fiado $ 1.000 a Rodríguez | Facturación +1.000, cobrado 0, debe 1.000 |
| 2 | Pago parcial | Debe 1.000, paga 400 | Saldo 600, viaje sigue 1.000, cobrado +400 |
| 3 | FIFO | Fiados lunes 500 y miércoles 300; paga 600 | Lunes saldado, miércoles 200, antigüedad desde miércoles |
| 4 | Pago mayor | Debe 200, paga 300 | Rechazado; solo con confirmación queda 100 a favor |
| 5 | Doble envío | Mismo cobro dos veces | Un solo cobro |
| 6 | Importe inválido | 0, −50, 10,555 | Los tres rechazados |
| 7 | Chofer cobra fiado | Juan recibe 600 en efectivo | Deuda −600, Juan a entregar 600, caja sin cambio |
| 8 | Entrega con diferencia | Esperado 600, entrega 550 | Diferencia 50 con nota; saldo de Juan 0 |
| 9 | Handy | Tarjeta 800, comisión 3 % | A acreditar 800; al acreditar 776, banco +776, gasto 24 |
| 10 | Liquidación A | 30 %: efectivo 2.000, tarjeta 800, fiado 1.000 | Facturado 3.800, parte 1.140, adelanto 300 aparte |
| 11 | Liquidación B | Mismos viajes | Parte ahora 840; 300 pendientes hasta que pague el cliente |
| 12 | Liquidación con combustible | Caso 10 + combustible 500, se queda con su parte | Entrega 2.000 − 500 − 1.140 = 360 |
| 13 | Gasto pendiente | Seguro 3.000 pendiente | Ganancia −3.000, caja y banco sin cambio; al pagar desde banco, −3.000 |
| 14 | Anulación | Anular cobro del caso 2 | Saldo vuelve a 1.000, cobro anulado visible, auditoría con motivo |
| 15 | Carga inicial | Fiado viejo 700 | Debe +700, facturación del mes sin cambio, fuera de liquidaciones |
| 16 | Datos incompletos | Semana con un día sin viajes | Resumen marcado "incompleto" |
| 17 | Precisión | 0,10 + 0,20 | Exactamente 0,30 |
| 18 | Zona horaria | Viaje 23:30 hora Uruguay | Cuenta para ese día |
| 19 | Cuota de coche | Cuota 9.800 del Móvil 2 | No entra en gastos de funcionamiento; sí en "después de cuota" |
| 20 | Límite de fiado | Límite 2.000, debe 1.300, fiado 800 | Aviso antes de guardar |

Además: restauración de copia probada y prueba de uso con el dueño en cada etapa.

## 10. Pendientes para confirmar con el dueño (todo queda configurable)

- [ ] Cómo rinden los choferes: entregan todo o se quedan con su parte.
- [ ] Cuándo cobra el chofer su parte de un fiado (A o B).
- [ ] Quién pierde si un fiado no se cobra.
- [ ] Gastos fijos mensuales con montos aproximados.
- [ ] Comisión de Handy y cada cuánto acredita.
- [ ] Por coche: cuotas (importe, día, cuántas quedan), seguro, patente.
- [ ] Empleados en planilla y cómo se les paga.
- [ ] Vencimientos: BPS, DGI, OSE, UTE, Antel, otros; frecuencia y día.
- [ ] Si hay contador o gestoría.
- [ ] Si el telefonista puede anotar llamadas perdidas.
- [ ] Límite de fiado por cliente fijo.
