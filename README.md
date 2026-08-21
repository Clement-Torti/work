# 🎯 Mi búsqueda de empleo en Estrasburgo

Versión web y responsive del documento `template.docx`: mismo diseño (teal `#1B7A6B`,
Calibri, tablas de cabecera oscura), pero editable desde el móvil y con los datos
guardados en **tu propia hoja de Google Sheets**.

> **La interfaz está en francés.** Los nombres de columna de la hoja y los comentarios
> del código se quedan en castellano a propósito: renombrar las columnas rompería las
> filas ya guardadas, y los comentarios son para quien mantiene el código, no para quien
> usa la página.

- Cada cambio se guarda solo, en el momento, y persiste.
- Dos perfiles (o los que quieras): al entrar eliges el tuyo o creas uno nuevo.
- La clave de la hoja **no está en el código**: la escribe cada persona en su navegador
  y se queda en el `localStorage` de ese dispositivo.
- Enlaces directos a todos los sitios de búsqueda del documento.
- Nota sobre 10 por candidatura, y una **ficha detallada** por candidatura con mapa,
  misiones, sueldo, modalidad, ventajas, preguntas de entrevista y contactos.

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

**Si al conectar sale que Google no deja entrar (error 403 / «Necesitas acceso»):**
la implementación no está en «Cualquier usuario». Ojo con las dos opciones parecidas —
hace falta **«Cualquier usuario»**, no «Cualquier usuario con una cuenta de Google»:
la página no manda credenciales de sesión, así que la segunda también la rechaza.

Si esa opción no aparece o sale en gris, es la política de tu Google Workspace, que
prohíbe publicar scripts fuera del dominio. En ese caso hay que crear la hoja y el script
con una **cuenta personal de Gmail** en vez de la del trabajo.

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

## Multiusuario: dos personas, una hoja

Cada fila de la hoja lleva la columna `profileId`, y toda lectura filtra por ella: el
perfil que abres solo ve lo suyo. Los datos **no se cruzan**, ni cuando los dos usáis el
mismo nombre de puesto, la misma empresa o marcáis el mismo canal.

- Cada escritura viaja con su `profileId`, así que un cambio pendiente se guarda en el
  perfil correcto aunque ya hayas cambiado de perfil en la pantalla.
- El `LockService` del script serializa las escrituras: dos cambios a la vez se ordenan
  en vez de pisarse.
- Borrar un tipo de puesto se lleva sus candidaturas; borrar un perfil se lleva todo lo
  suyo. Ninguno de los dos toca al otro perfil.
- La fila de un canal tiene un id derivado del perfil y del canal, no aleatorio: si abres
  **el mismo perfil** en el móvil y en el portátil, los dos escriben en la misma fila en
  vez de crear duplicados.

**Lo que esto no es: privacidad.** Cualquiera con la clave de la hoja ve la lista de
perfiles y puede abrir cualquiera de ellos. Están separados, no protegidos con
contraseña. Para dos personas que comparten la hoja a propósito es lo que se quiere; si
hiciera falta que uno no viera lo del otro, harían falta dos hojas separadas (dos claves
distintas), y eso funciona hoy sin cambiar nada del código.

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

**La ubicación se hereda, no se copia.** Una candidatura sin punto propio muestra el de
su empresa, resuelto **al mostrar** comparando `empresa` con `Companies.name` (sin
distinguir mayúsculas ni espacios sobrantes). La consecuencia útil: si corriges la
dirección de una empresa, todas sus candidaturas se mueven solas. En cuanto pones un
punto propio en una candidatura (buscando, pinchando el mapa o arrastrando el marcador),
ése manda, y aparece un botón para volver a la dirección de la empresa. Nada se duplica
en la hoja: `lat`/`lon` vacíos *significan* «heredado».

El enlace es por nombre, no por id, porque el campo tiene que seguir aceptando texto
libre. El efecto secundario: si renombras una empresa, las candidaturas que tenían el
nombre viejo dejan de heredar su dirección hasta que vuelvas a escribir el nombre nuevo
(con el autocompletado, un segundo).

**El mapa.** Leaflet 1.9.4 desde unpkg, con hashes SRI, y teselas de OpenStreetMap. La
búsqueda de direcciones usa Nominatim (OSM), solo al pulsar el botón, así que no hay
riesgo de pasarse de su límite de peticiones. Si Leaflet no carga (sin conexión, CDN
bloqueado), la ficha lo dice y la dirección en texto se sigue guardando igual: no queda
un hueco roto. El punto se puede poner buscando la dirección, pinchando en el mapa, o
arrastrando el marcador; se guarda como `lat`/`lon` en la hoja.

---

## Estructura de la hoja

| Pestaña | Columnas |
|---|---|
| `Profiles` | `id`, `name`, `createdAt` |
| `JobTypes` | `id`, `profileId`, `position`, `tipo`, `porQue`, `nivelFrances`, `prioridad` |
| `Applications` | `id`, `profileId`, `jobTypeId`, `position`, `fecha`, `empresa`, `puesto`, `fuente`, `estado`, `proximaAccion`, `enlace`, `nota`, `misiones`, `sueldo`, `modalidad`, `ventajas`, `ubicacion`, `lat`, `lon` |
| `Channels` | `id`, `profileId`, `channelKey`, `name`, `url`, `hecho`, `notas` |
| `Companies` | `id`, `profileId`, `position`, `name`, `description`, `ubicacion`, `lat`, `lon` |
| `Questions` | `id`, `profileId`, `applicationId`, `position`, `question`, `answered`, `answer` |
| `Learnings` | `id`, `profileId`, `applicationId`, `position`, `note` |
| `Contacts` | `id`, `profileId`, `applicationId`, `position`, `name`, `role`, `email`, `phone` |

Las columnas nuevas se añaden **siempre al final**. Insertarlas en medio desalinearía
las filas ya guardadas: es la razón por la que `nota` aparece después de `enlace` y no
junto a `estado`, aunque en la página salgan seguidas.

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
3. **Empresas** — alta, edición y borrado de empresas: nombre, descripción y dirección.
   Un mapa centrado en Estrasburgo muestra todas, con el nombre en el marcador. Para
   colocar una, se escribe la dirección y se pulsa «Chercher» (Nominatim); si no la
   encuentra, el punto se posa en el centro de Estrasburgo para poder arrastrarlo al
   sitio correcto, en vez de dejar la empresa fuera del mapa. Los marcadores se arrastran
   para afinar. Borrar una empresa **no** borra sus candidaturas: solo pierden la
   dirección heredada.
4. **Seguimiento de candidaturas** — una tabla por tipo de puesto, generada
   automáticamente a partir de la sección 2, más un resumen (candidaturas, enviadas,
   entrevistas, por mandar). El estado y la **nota sobre 10** se colorean solos. Cada
   candidatura guarda además el **enlace a la oferta**, opcional: va debajo del título
   del puesto y, en cuanto hay algo escrito, aparece una flecha ↗ para abrirla en otra
   pestaña. Se puede pegar sin `https://` delante.

   El botón **Fiche** abre la ficha detallada, con un contador de cuántos datos hay
   dentro. La ficha guarda: misiones, fourchette de salaire, modalidad (presencial /
   híbrido / teletrabajo), ventajas, ubicación con mapa, las preguntas que te hicieron
   en la entrevista (y si supiste responder), lo que aprendiste, y los contactos en la
   empresa (nombre, puesto, correo, teléfono, con enlaces para escribir o llamar).

   La columna **Entreprise** es un campo de texto libre con autocompletado (`<datalist>`)
   de las empresas de la sección 3.
5. **Preguntas de entrevista** — todas las preguntas de todas las entrevistas juntas,
   con la respuesta que conviene dar si te la vuelven a hacer. Se edita indistintamente
   desde aquí o desde la ficha; el nombre de la empresa es un enlace que abre su ficha.

En pantalla pequeña las tablas se convierten en tarjetas apiladas con el nombre de cada
columna encima, para no tener que hacer scroll horizontal.
