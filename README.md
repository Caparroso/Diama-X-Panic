# Diama X Panic — invitación interactiva

Sitio estático con escena WebGL 2, navegación por Line up / Registro / Ubicación, cambio automático de modelos cada cinco segundos y boleto descargable.

La secuencia 3D actual muestra la Luna de Majora's Mask, la espada Panic X Diama, OBJT 1, el logo 3D de Panic y el modelo de Diama.

## Datos editables

Los datos centrales están en `data.js`. El evento está configurado para el 30 de octubre de 2026 a las 8:00 PM en Casa Jugo.

Para previsualizarlo localmente, sirve esta carpeta con cualquier servidor HTTP estático. Los modelos no cargan correctamente al abrir `index.html` directamente con `file://`.

## Registro

El registro genera un boleto vertical con proporción de pantalla de iPhone, nombre, Instagram, token único y valor de $100 MXN. El usuario debe conservarlo mediante una captura de pantalla.

El envío remoto está desactivado hasta contar con un formulario exclusivo de Diama X Panic. Configura `registrationEndpoint` en `data.js` cuando exista el destino definitivo.
