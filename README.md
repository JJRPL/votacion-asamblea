# 🗳️ Sistema de Votación - Multifamiliares La Posada

Sistema de votación digital para la asamblea de propietarios.

## 🚀 Uso en línea (GitHub Pages)

1. Sube los archivos a un repositorio público en GitHub
2. Ve a **Settings → Pages → Source → main branch / root**
3. La URL estará disponible en: `https://TU-USUARIO.github.io/NOMBRE-REPO/`

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Página principal |
| `style.css` | Estilos |
| `app.js` | Lógica de la aplicación |
| `data.js` | Datos de apartamentos |

## 🔐 Acceso Admin

Código: **9706**

## ✅ Funcionalidades

- 200 apartamentos con coeficiente y propietario
- Generación de códigos PIN de 5 dígitos únicos
- Panel admin con estadísticas en tiempo real
- Soporte para múltiples preguntas
- Cierre individual de preguntas
- Los códigos se reutilizan si hay nuevas preguntas sin responder
- Exportación de códigos, votos y resultados en CSV
- Resultados con porcentaje por votos y por coeficiente
- Almacenamiento en `localStorage` del navegador

## ⚠️ Nota sobre persistencia

Los datos se guardan en `localStorage` del navegador.
Para una asamblea real, use un **único dispositivo** como estación de votación,
o comparta el mismo navegador/equipo entre los votantes.

## 🔄 Para reiniciar la votación

En el panel de administrador → Códigos → "Resetear Todo"
