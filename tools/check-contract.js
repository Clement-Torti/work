/**
 * Contrato entre el frontend y Code.gs.   node tools/check-contract.js
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

console.log('\n' + (fail ? fail + ' PRUEBA(S) FALLIDA(S)' : 'Contrato: ninguna prueba falla.'));
process.exit(fail ? 1 : 0);
