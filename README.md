# Diama X Panic — invitación interactiva

Sitio estático con escena WebGL 2, navegación por Line up / Boletos / Ubicación y cambio automático de modelos cada cinco segundos.

La secuencia 3D actual muestra la Luna de Majora's Mask, la espada Panic X Diama, OBJT 1, el logo 3D de Panic y el modelo de Diama.

## Datos editables

Los datos centrales están en `data.js`. El evento está configurado para el 30 de octubre de 2026 a las 8:00 PM en Santiago de Querétaro.

Para previsualizarlo localmente, sirve esta carpeta con cualquier servidor HTTP estático. Los modelos no cargan correctamente al abrir `index.html` directamente con `file://`.

## Boletos

La sección de boletos muestra las opciones vigentes y dirige a la venta oficial en Shows.link. Actualiza precios, fase, estado, promoción y URL dentro de `ticketing` en `data.js` cuando cambie la preventa.
