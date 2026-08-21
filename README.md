# 🎯 Mi búsqueda de empleo en Estrasburgo

Versión web y responsive del documento `template.docx`: mismo diseño (teal `#1B7A6B`,
Calibri, tablas de cabecera oscura), pero editable desde el móvil y con los datos
guardados en **tu propia hoja de Google Sheets**.

- Cada cambio se guarda solo, en el momento, y persiste.
- Dos perfiles (o los que quieras): al entrar eliges el tuyo o creas uno nuevo.
- La clave de la hoja **no está en el código**: la escribe cada persona en su navegador
  y se queda en el `localStorage` de ese dispositivo.
- Enlaces directos a todos los sitios de búsqueda del documento.

---

## Puesta en marcha (una sola vez, ~3 minutos)

### 1. Crear la hoja y pegar el backend

1. Crea una hoja nueva en [sheets.new](https://sheets.new). Llámala como quieras.
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido de `Código.gs` y pega todo el archivo
   [`apps-script/Code.gs`](apps-script/Code.gs) de este repositorio. Guarda (Ctrl+S).

No hace falta crear ninguna pestaña ni cabecera a mano: el script crea las hojas
`Profiles`, `JobTypes`, `Applications` y `Channels` la primera vez que se usan.

### 2. Publicar la app web

1. Botón **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. **Ejecutar como:** Yo (tu cuenta).
4. **Quién tiene acceso:** **Cualquier usuario**.
   > Es imprescindible. Con «Solo yo» el navegador recibe una página de login en vez de
   > datos y la página no podrá conectarse. La URL es larga y aleatoria: quien no la
   > tenga no puede llegar a la hoja.
5. **Implementar** y autoriza los permisos que pide Google.
6. Copia la **URL de la aplicación web**. Acaba en `/exec`. Ésa es la clave.

### 3. Abrir la página y pegar la clave

Abre `index.html` (ver *Dónde alojarla* abajo), pega la URL y pulsa **Conectar con mi hoja**.
Después elige o crea tu perfil. En el otro teléfono se pega la misma clave: misma hoja,
perfiles distintos.

> **Al cambiar el código de `Code.gs`** hay que ir a **Implementar → Gestionar
> implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. Así la URL
> no cambia y no hay que volver a pegar la clave.

---

## Dónde alojarla

Es HTML, CSS y JS estáticos: no hay build, ni dependencias, ni servidor.

- **GitHub Pages** — en el repo: *Settings → Pages → Source: Deploy from a branch →
  `main` / `root`*. Queda en `https://clement-torti.github.io/work/`.
- **Cualquier hosting estático** (Netlify, Cloudflare Pages, Vercel…): sirve la carpeta tal cual.
- **Sin hosting** — abrir `index.html` directamente desde el disco también funciona,
  pero entonces hay que tener el archivo en cada dispositivo.

Para usarla desde el móvil, la opción cómoda es Pages (o cualquier hosting) y
«Añadir a la pantalla de inicio».

---

## Cómo funciona

```
index.html          la página (tres vistas: conectar → elegir perfil → documento)
assets/styles.css   el diseño del documento, adaptado a pantallas pequeñas
assets/app.js       estado, cola de guardado y render
apps-script/Code.gs la base de datos: una hoja de Google Sheets por detrás
template.docx       el documento original, como referencia del diseño
```

**Guardado.** Cada tecleo actualiza la pantalla al momento y encola la fila en una cola
de escritura con una clave por registro. Si sigues escribiendo en el mismo campo, la
versión nueva sustituye a la que aún no ha salido, así que escribir rápido no genera
decenas de peticiones. La cola se vacía en orden, de una en una; si falla la red
reintenta con espera creciente y avisa arriba a la derecha. El indicador dice
*Guardando… / Guardado / Sin guardar*, y el navegador pregunta antes de cerrar si queda
algo pendiente.

**Concurrencia.** Como la vais a usar dos personas, el script coge un `LockService`
en cada escritura: dos cambios simultáneos se ordenan en vez de pisarse.

**Por qué una app web y no la API de Sheets.** La API de Google Sheets con clave de API
solo permite *leer* hojas públicas, así que no sirve para guardar. La alternativa
(OAuth) obliga a registrar un proyecto y una lista de dominios permitidos. Una app web
de Apps Script es la única forma de tener lectura y escritura pegando una sola URL, sin
credenciales en el código.

**Nota técnica.** Las peticiones van como `text/plain` a propósito: así el navegador no
lanza un *preflight* CORS, que Apps Script no sabe contestar por culpa de su redirección
interna a `googleusercontent.com`.

---

## Estructura de la hoja

| Pestaña | Columnas |
|---|---|
| `Profiles` | `id`, `name`, `createdAt` |
| `JobTypes` | `id`, `profileId`, `position`, `tipo`, `porQue`, `nivelFrances`, `prioridad` |
| `Applications` | `id`, `profileId`, `jobTypeId`, `position`, `fecha`, `empresa`, `puesto`, `fuente`, `estado`, `proximaAccion` |
| `Channels` | `id`, `profileId`, `channelKey`, `name`, `url`, `hecho`, `notas` |

Se puede editar a mano en Sheets sin problema, siempre que no se toque la columna `id`
ni la fila de cabeceras. Borrar un tipo de puesto desde la página borra también sus
candidaturas; borrar un perfil borra todo lo suyo.

---

## Lo que hay en cada sección

1. **Canales de búsqueda** — los siete canales del documento, cada uno con sus enlaces
   (France Travail, LinkedIn, Indeed, HelloWork, Welcome to the Jungle, APEC, Manpower,
   Adecco, Randstad, grupos de Facebook, candidatura espontánea), con casilla de «listo»
   y sitio para notas. Se pueden añadir canales propios.
2. **Tipos de puesto** — la tabla del documento, con listas cerradas para el nivel de
   francés y la prioridad.
3. **Seguimiento de candidaturas** — una tabla por tipo de puesto, generada
   automáticamente a partir de la sección 2, más un resumen (candidaturas, enviadas,
   entrevistas, por mandar). El estado se colorea solo.

En pantalla pequeña las tablas se convierten en tarjetas apiladas con el nombre de cada
columna encima, para no tener que hacer scroll horizontal.
