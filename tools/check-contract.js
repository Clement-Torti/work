/**
 * Comprobaciones estaticas del proyecto.   node tools/check-contract.js
 *
 * 1. Contrato entre el frontend y Code.gs.
 *
 * Existe por un fallo real: la seccion Entreprises se envio con el frontend
 * llamando a 'upsertCompany' y Code.gs sin esa ruta. Las pruebas del frontend
 * no lo vieron porque hablan con un backend simulado. Esta prueba compara los
 * dos archivos de verdad, y ademas ejercita las rutas contra el simulador de
 * Sheets, no contra un mock.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/styles.css'), 'utf8');
const codeGs = fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8');

let fail = 0;
const check = (l, c, x) => {
  if (c) console.log('  ok   ' + l);
  else { fail++; console.log('  FAIL ' + l + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); }
};

// ------------------------------------------------------- 1. las acciones
const uniq = (a) => Array.from(new Set(a)).sort();

const called = uniq([]
  .concat([...appJs.matchAll(/\bapi\('([A-Za-z]+)'/g)].map(m => m[1]))
  .concat([...appJs.matchAll(/\benqueue\([^,]+,\s*'([A-Za-z]+)'/g)].map(m => m[1])));

const routed = uniq([...codeGs.matchAll(/case\s+'([A-Za-z]+)'\s*:/g)].map(m => m[1]));

console.log('\n== toda accion del frontend tiene su ruta en Code.gs ==');
console.log('  frontend llama a: ' + called.join(', '));
const sinRuta = called.filter(a => !routed.includes(a));
check('ninguna accion sin ruta', sinRuta.length === 0, sinRuta);

console.log('\n== ninguna ruta muerta ==');
const sinUso = routed.filter(a => !called.includes(a));
// Estas dos existen en el backend a proposito, aun sin boton en la interfaz:
// se pueden invocar a mano y estan listas si algun dia se anaden.
const permitidas = ['renameProfile', 'deleteProfile'];
check('ninguna ruta sin usar (salvo las previstas)',
  sinUso.every(a => permitidas.includes(a)), sinUso);

// --------------------------------------- 2. las colecciones de loadProfile
console.log('\n== loadProfile devuelve todo lo que el frontend lee ==');
const lp = codeGs.slice(codeGs.indexOf('function loadProfile'));
const devuelve = uniq([...lp.slice(0, lp.indexOf('\n}')).matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]));

const bloque = appJs.slice(appJs.indexOf("api('loadProfile'"));
const lee = uniq([...bloque.slice(0, 1200).matchAll(/data\.(\w+)\s*\|\|\s*\[\]/g)].map(m => m[1]));
console.log('  el frontend lee: ' + lee.join(', '));
const faltan = lee.filter(k => !devuelve.includes(k));
check('loadProfile no se olvida de ninguna coleccion', faltan.length === 0, faltan);

// ------------------------------------------- 3. toda tabla usada existe
console.log('\n== toda tabla nombrada en Code.gs esta en el esquema ==');
const esquema = uniq([...codeGs.slice(codeGs.indexOf('var SCHEMA'), codeGs.indexOf('var CHILDREN'))
  .matchAll(/^\s{2}(\w+):\s*\[/gm)].map(m => m[1]));
const usadas = uniq([]
  .concat([...codeGs.matchAll(/\bupsert\('(\w+)'/g)].map(m => m[1]))
  .concat([...codeGs.matchAll(/\bremove\('(\w+)'/g)].map(m => m[1]))
  .concat([...codeGs.matchAll(/\breadAll\('(\w+)'/g)].map(m => m[1]))
  .concat([...codeGs.matchAll(/\breadWhere\('(\w+)'/g)].map(m => m[1])));
console.log('  esquema: ' + esquema.join(', '));
check('ninguna tabla fantasma', usadas.every(t => esquema.includes(t)),
  usadas.filter(t => !esquema.includes(t)));
check('ninguna tabla del esquema sin usar', esquema.every(t => usadas.includes(t)),
  esquema.filter(t => !usadas.includes(t)));

// -------------------------- 4. las rutas nuevas, contra el simulador real
console.log('\n== Companies funciona de verdad contra Code.gs ==');
let counter = 0;
function makeSheet() {
  const grid = [];
  const get = (r, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : '');
  const chain = () => ({ setFontWeight: chain, setBackground: chain, setFontColor: chain });
  const sh = {
    _grid: grid,
    getLastRow: () => { let l = 0; grid.forEach((r, i) => { if (r && r.some(v => String(v) !== '')) l = i + 1; }); return l; },
    getLastColumn: () => { let l = 0; grid.forEach(r => { if (r) r.forEach((v, c) => { if (String(v) !== '') l = Math.max(l, c + 1); }); }); return l; },
    getRange: (row, col, nR = 1, nC = 1) => Object.assign({
      getValues: () => { const o = []; for (let r = 0; r < nR; r++) { const li = []; for (let c = 0; c < nC; c++) li.push(get(row - 1 + r, col - 1 + c)); o.push(li); } return o; },
      setValues: (v) => { v.forEach((li, r) => { const gr = row - 1 + r; if (!grid[gr]) grid[gr] = []; li.forEach((x, c) => { grid[gr][col - 1 + c] = x; }); }); return chain(); }
    }, chain()),
    appendRow: (li) => { grid[sh.getLastRow()] = li.slice(); },
    deleteRow: (row) => { grid.splice(row - 1, 1); },
    setFrozenRows: () => sh
  };
  return sh;
}
const sheets = new Map();
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getName: () => 'Feuille', getSheetByName: (n) => sheets.get(n) || null,
  insertSheet: (n) => { const s = makeSheet(); sheets.set(n, s); return s; } }) };
global.LockService = { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) };
global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ _t: t, setMimeType: () => ({ _t: t }) }) };
global.Utilities = { getUuid: () => 'uuid-' + (++counter), formatDate: (d) => d.toISOString().slice(0, 10) };
global.Session = { getScriptTimeZone: () => 'Europe/Paris' };

new Function(codeGs + '\nglobal.doPost = doPost;')();
const call = (a, p) => JSON.parse(global.doPost({ postData: { contents: JSON.stringify({ action: a, payload: p }) } })._t);

const A = call('createProfile', { name: 'Clement' }).data.profile;
const B = call('createProfile', { name: 'Maria' }).data.profile;

let r = call('upsertCompany', { id: 'co1', profileId: A.id, position: 10, name: 'Ubisoft',
  description: 'Studio de jeux', ubicacion: '1 rue de la Paix, Strasbourg', lat: '48.59', lon: '7.75' });
check('upsertCompany responde ok', r.ok === true, r);
call('upsertCompany', { id: 'co2', profileId: A.id, position: 20, name: 'Arte' });
call('upsertCompany', { id: 'co9', profileId: B.id, position: 10, name: 'De Maria' });

let d = call('loadProfile', { profileId: A.id }).data;
check('loadProfile trae las empresas', Array.isArray(d.companies) && d.companies.length === 2,
  d.companies);
const co = d.companies.find(c => c.id === 'co1');
check('nombre guardado', co.name === 'Ubisoft', co);
check('descripcion guardada', co.description === 'Studio de jeux', co);
check('direccion guardada', co.ubicacion === '1 rue de la Paix, Strasbourg', co);
check('lat/lon guardados como texto', co.lat === '48.59' && co.lon === '7.75', co);
check('ordenadas por position', d.companies[0].id === 'co1' && d.companies[1].id === 'co2',
  d.companies.map(c => c.id));
check('B no ve las de A', call('loadProfile', { profileId: B.id }).data.companies.length === 1);

// actualizar no duplica
call('upsertCompany', { id: 'co1', profileId: A.id, position: 10, name: 'Ubisoft Strasbourg',
  description: 'Studio de jeux', ubicacion: '1 rue de la Paix, Strasbourg', lat: '48.60', lon: '7.76' });
d = call('loadProfile', { profileId: A.id }).data;
check('actualiza en sitio, sin duplicar', d.companies.length === 2, d.companies.map(c => c.id));
check('el valor nuevo esta', d.companies.find(c => c.id === 'co1').name === 'Ubisoft Strasbourg');

r = call('deleteCompany', { id: 'co2' });
check('deleteCompany funciona', r.ok && r.data.removed === true, r);
d = call('loadProfile', { profileId: A.id }).data;
check('queda una', d.companies.length === 1 && d.companies[0].id === 'co1', d.companies);

console.log('\n== borrar el perfil se lleva sus empresas ==');
call('upsertApplication', { id: 'ap1', profileId: A.id, jobTypeId: 'jt1', position: 10, empresa: 'Ubisoft Strasbourg' });
call('deleteProfile', { id: A.id });
d = call('loadProfile', { profileId: A.id }).data;
check('no queda ninguna empresa de A', d.companies.length === 0, d.companies);
check('ni candidaturas', d.applications.length === 0, d.applications);
const b = call('loadProfile', { profileId: B.id }).data;
check('B conserva la suya', b.companies.length === 1 && b.companies[0].name === 'De Maria', b.companies);

const shCo = sheets.get('Companies');
const filas = shCo ? shCo._grid.slice(1).filter(x => x && String(x[0]).trim()) : [];
check('ninguna fila huerfana en la hoja Companies',
  filas.every(x => x[1] === B.id), filas);

// ------------------------------------------- 5. estructura del modal
// Existe por un fallo real: .modal era a la vez contenedor flex con
// margin:auto y el elemento con scroll. Con contenido mas alto que la
// pantalla, eso desplazaba el borde superior del panel por encima del origen
// del scroll y la cabecera sticky se descolocaba, dejando pasar el contenido
// por delante de ella. El scroll tiene que vivir en .modal-body.
console.log('\n== el modal scrollea por dentro, sin sticky ==');

function rule(selector) {
  var i = css.indexOf('\n' + selector + ' {');
  if (i < 0) return null;
  return css.slice(i, css.indexOf('}', i));
}

const rModal = rule('.modal');
const rPanel = rule('.modal-panel');
const rHead = rule('.modal-head');
const rBody = rule('.modal-body');

check('las cuatro reglas del modal existen', !!(rModal && rPanel && rHead && rBody),
  { modal: !!rModal, panel: !!rPanel, head: !!rHead, body: !!rBody });

check('.modal no scrollea', /overflow:\s*hidden/.test(rModal || ''), rModal);
check('.modal-panel es una columna flex', /flex-direction:\s*column/.test(rPanel || ''), rPanel);
check('.modal-panel esta limitado en alto', /max-height:/.test(rPanel || ''), rPanel);
check('.modal-panel recorta sus esquinas', /overflow:\s*hidden/.test(rPanel || ''), rPanel);
check('.modal-head NO es sticky', !/position:\s*sticky/.test(rHead || ''), rHead);
check('.modal-head no se encoge', /flex:\s*none/.test(rHead || ''), rHead);
check('.modal-body es el que scrollea', /overflow-y:\s*auto/.test(rBody || ''), rBody);
check('.modal-body puede encogerse (min-height:0)', /min-height:\s*0/.test(rBody || ''), rBody);
check('el scroll no se contagia a la pagina',
  /overscroll-behavior:\s*contain/.test(rBody || ''), rBody);

console.log('\n== el resalte del pin no toca transform ==');
const rHl = rule('.leaflet-marker-icon.marker-hl');
check('la regla del resalte existe', !!rHl, rHl);
// Leaflet coloca los marcadores con transform: tocarlo los desplazaria.
check('no usa transform', !/transform:/.test(rHl || ''), rHl);
check('usa filter', /filter:/.test(rHl || ''), rHl);

// ------------------------- 6. seccion 4: preguntas agrupadas y plegadas
// Se piden dos cosas concretas: un grupo por empresa y todos cerrados al
// entrar. Las pruebas sacan renderAllQuestions del propio app.js y la corren
// con stubs, asi que comprueban el HTML de verdad.
console.log('\n== las questions van agrupadas por empresa y plegadas ==');

function renderQuestions(state, openQGroups) {
  const i = appJs.indexOf('  function renderAllQuestions()');
  const j = appJs.indexOf('\n  }\n', appJs.indexOf('autoGrowAll(box);', i));
  const body = appJs.slice(i, j + 4);
  const box = { innerHTML: '', querySelector: () => null };
  const env = {
    state, openQGroups,
    ORPHAN_Q: '__sans-candidature__',
    REPONDU: [],
    $: () => box,
    esc: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    byId: (a, id) => a.find(x => x.id === id) || null,
    selectHtml: (o, v) => '<select>' + v + '</select>',
    appLabel: (a) => !a ? '—' : (a.empresa || a.puesto || 'Candidature sans nom'),
    autoGrowAll: () => {}
  };
  const keys = Object.keys(env);
  new Function(...keys, body + '\nrenderAllQuestions();')(...keys.map(k => env[k]));
  return box.innerHTML;
}

const qState = {
  applications: [
    { id: 'a1', empresa: 'Ubisoft', puesto: 'Dev web' },
    { id: 'a2', empresa: 'Arte', puesto: '' },
    { id: 'a3', empresa: 'Sin preguntas', puesto: '' }
  ],
  questions: [
    { id: 'q1', applicationId: 'a2', position: 20, question: 'Pourquoi nous ?', answered: 'oui', answer: '' },
    { id: 'q2', applicationId: 'a1', position: 10, question: 'Vos faiblesses ?', answered: 'non', answer: '' },
    { id: 'q3', applicationId: 'a1', position: 20, question: 'Salaire ?', answered: '', answer: '' },
    { id: 'q4', applicationId: 'a2', position: 10, question: 'Dispo ?', answered: 'oui', answer: '' },
    { id: 'q5', applicationId: 'borrada', position: 10, question: 'Vieja', answered: '', answer: '' }
  ]
};

let qh = renderQuestions(qState, {});
const grupos = [...qh.matchAll(/data-qgroup="([^"]+)"([^>]*)>\s*<summary[^>]*>(.*?)<\/summary>/gs)];

check('un grupo por candidatura con preguntas, mas el de las huerfanas',
  grupos.length === 3, grupos.map(g => g[1]));
check('sin grupo para la candidatura sin preguntas', !qh.includes('data-qgroup="a3"'));
check('siguen el orden de las candidaturas',
  grupos.map(g => g[1]).join(',') === 'a1,a2,__sans-candidature__', grupos.map(g => g[1]));
check('TODOS cerrados al entrar', grupos.every(g => !/\bopen\b/.test(g[2])),
  grupos.map(g => g[1] + g[2]));
check('el titulo del grupo es la empresa', /Ubisoft/.test(grupos[0][3]) && /Arte/.test(grupos[1][3]));
check('la cabecera cuenta las preguntas y las que faltan por responder',
  /2 questions/.test(grupos[0][3]) && /2 à revoir/.test(grupos[0][3]), grupos[0][3]);
check('sin "à revoir" cuando estan todas respondidas', !/revoir/.test(grupos[1][3]), grupos[1][3]);
check('las preguntas de una candidatura borrada no se pierden',
  /Candidature supprim/.test(grupos[2][3]) && qh.includes('Vieja'));
check('la columna Entreprise ya no hace falta dentro del grupo', !qh.includes('>Entreprise<'));
check('cada pregunta cae en su grupo',
  qh.slice(qh.indexOf('data-qgroup="a1"'), qh.indexOf('data-qgroup="a2"')).includes('Salaire'));
check('ordenadas por position dentro del grupo',
  qh.indexOf('Vos faiblesses') < qh.indexOf('Salaire') && qh.indexOf('Dispo') < qh.indexOf('Pourquoi nous'));
check('el total sigue al pie', /5 questions au total/.test(qh));
check('hay boton para desplegarlos todos', /data-q-toggle-all/.test(qh));
check('HTML equilibrado',
  (qh.match(/<details/g) || []).length === (qh.match(/<\/details>/g) || []).length &&
  (qh.match(/<tr[ >]/g) || []).length === (qh.match(/<\/tr>/g) || []).length);

// Un grupo abierto tiene que seguir abierto tras repintar: pasa en cada
// borrado de pregunta y al cerrar la ficha.
qh = renderQuestions(qState, { a2: true });
const g2 = [...qh.matchAll(/data-qgroup="([^"]+)"([^>]*)>/g)];
check('lo que el usuario abrio sigue abierto tras repintar',
  /\bopen\b/.test(g2.find(g => g[1] === 'a2')[2]) &&
  !/\bopen\b/.test(g2.find(g => g[1] === 'a1')[2]), g2.map(g => g[1] + g[2]));
check('el boton pasa a "Tout replier" cuando ya hay alguno abierto',
  /Tout replier/.test(qh) && !/Tout déplier/.test(qh));

console.log('\n== en papel los grupos cerrados se abren ==');
const rPrint = css.slice(css.indexOf('@media print'));
check('la regla de impresion existe', /\.qgroup:not\(\[open\]\)/.test(rPrint), rPrint);

console.log('\n' + (fail ? fail + ' PRUEBA(S) FALLIDA(S)' : 'Contrato: ninguna prueba falla.'));
process.exit(fail ? 1 : 0);
