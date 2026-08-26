# LUMA

Web app/PWA experimental para videollamadas privadas uno-a-uno con WebRTC P2P.

## Qué hace esta primera versión

- Invitaciones mediante enlace, sin cuentas.
- Audio y vídeo WebRTC entre los participantes.
- Motor de señalización/handshake de VDO.Ninja SDK 1.5.5.
- Modo **AUTO** y **XTREME**.
- XTREME pide hasta 3840×2160 / 60 fps y eleva el techo de bitrate a 60 Mb/s cuando el navegador lo permite.
- Opción **Solo conexión directa**: desactiva TURN; si la red no permite P2P, la llamada no se establece.
- Telemetría real: resolución, FPS, bitrate, RTT, pérdida, códec y ruta ICE (DIRECT/RELAY).
- Selector dinámico de todas las cámaras que el navegador expone.
- Control de zoom/lentes cuando `MediaStreamTrack.getCapabilities()` expone `zoom`.
- PWA instalable y diseño responsive para iPhone.

## Privacidad

El enlace contiene un identificador de sala y una clave aleatoria en el fragmento `#` de la URL. El fragmento no se envía al servidor HTTP que sirve la página. VDO.Ninja se usa para el handshake WebRTC. Una conexión DIRECT transporta los medios P2P; si se permite fallback, WebRTC puede usar TURN en redes restrictivas.

## Limitación importante de iPhone/Safari

La aplicación puede usar **todas las cámaras que WebKit exponga a `enumerateDevices()`**. En algunos iPhone, Safari expone únicamente una cámara frontal y una cámara trasera virtual aunque el teléfono tenga varias lentes físicas. LUMA detecta automáticamente cámaras adicionales y controles de zoom cuando estén disponibles, pero una PWA no puede saltarse una limitación del navegador.

## Publicación

Es una web estática. Puede servirse directamente con GitHub Pages desde la raíz de `main`.

## Stack

HTML + CSS + JavaScript, sin framework ni compilación.
VDO.Ninja SDK fijado a `@vdoninja/sdk@1.5.5`.
