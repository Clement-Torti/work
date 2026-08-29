/**
 * Arranca el frontend de verdad.   node tools/check-boot.js
 *
 * Las comprobaciones de check-contract.js miran el codigo; esta CARGA
 * assets/app.js contra un DOM de mentira construido con los ids del index.html
 * real, con una hoja simulada detras, y mira lo que pinta.
 *
 * Existe por dos fallos reales que ninguna prueba estatica veia:
 *  - un listener enganchado a un contenedor que solo existe dentro de un modal
 *    ya abierto: reventaba app.js entero al cargar, la pagina no arrancaba;
 *  - con una lista de revision a medias, marcar una casilla del catalogo no
 *    hacia nada, en silencio.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

let fail = 0;
const check = (l, c, x) => {
  if (c) console.log('  ok   ' + l);
  else { fail++; console.log('  FAIL ' + l + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); }
};

// ------------------------------------------------------- el DOM de mentira
let uidN = 0;

function fakeEl(id) {
  return {
    id, _html: '', _l: {}, hidden: false, value: '', textContent: '', placeholder: '',
    disabled: false, checked: false, tagName: 'DIV', type: '', className: '',
    scrollHeight: 20, scrollTop: 0, attributes: {}, style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); }
    },
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    removeEventListener() {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, select() {}, remove() {},
    appendChild() {}, replaceChild() {}, insertBefore() {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    get firstChild() { return fakeEl('frag'); }
  };
}

const els = {};
[...html.matchAll(/id="([^"]+)"/g)].forEach(m => { els[m[1]] = fakeEl(m[1]); });
const missing = new Set();

function attrEl(attr, value) {
  const el = fakeEl(attr + ':' + value);
  el.setAttribute(attr, value);
  return el;
}
const panes = ['emploi', 'vehicule', 'logement'].map(v => attrEl('data-pane', v));
const tabs = ['emploi', 'vehicule', 'logement'].map(v => attrEl('data-tab', v));

global.document = {
  getElementById(id) {
    if (!els[id]) {
      // Un id puede venir de un innerHTML ya escrito: en un navegador existiria.
      const nacido = Object.keys(els).some(k => els[k]._html.indexOf('id="' + id + '"') >= 0);
      if (!nacido) { missing.add(id); return null; }
      els[id] = fakeEl(id);
    }
    return els[id];
  },
  addEventListener() {},
  createElement: () => fakeEl('created'),
  querySelectorAll(sel) {
    if (sel === '[data-pane]') return panes;
    if (sel === '[data-tab]') return tabs;
    return [];
  },
  body: fakeEl('body')
};
global.window = {
  addEventListener() {}, scrollTo() {},
  crypto: { randomUUID: () => 'uuid-' + (++uidN) },
  CSS: { escape: (s) => String(s) }
};
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};
global.confirm = () => true;
global.alert = () => {};

const H = (id) => (els[id] ? els[id].innerHTML : '(no existe)');
const T = (id) => (els[id] ? els[id].textContent : '(no existe)');

function fire(elId, type, target) {
  const el = els[elId];
  if (!el || !el._l[type]) return false;
  el._l[type].forEach(fn => fn({ target, preventDefault() {}, key: '' }));
  return true;
}
/** Un objetivo de evento: sus atributos, y a que responde su closest(). */
function target(attrs, closest, extra) {
  const t = Object.assign({
    tagName: 'BUTTON', type: 'button', value: '', checked: false,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute() {}, classList: fakeEl('t').classList,
    closest: (sel) => (sel in closest ? closest[sel] : null)
  }, extra || {});
  return t;
}

// ------------------------------------------------------ la hoja de mentira
const PROFILE = { id: 'P1', name: 'Vero', createdAt: '2026-01-01' };
const DATA = {
  jobTypes: [{ id: 'jt1', profileId: 'P1', position: 10, tipo: 'Développeur web',
    porQue: '', nivelFrances: '', prioridad: 'Haute' }],
  applications: [{ id: 'a1', profileId: 'P1', jobTypeId: 'jt1', position: 10, fecha: '2026-08-01',
    empresa: 'Arte', puesto: 'Dev', fuente: 'Indeed', estado: 'À valider', proximaAccion: '',
    enlace: 'https://x.fr', nota: '8', misiones: '', sueldo: '', modalidad: 'Hybride',
    ventajas: '', ubicacion: '', lat: '', lon: '', notaComentario: 'ok',
    cartaMotivacion: 'Madame…', contrato: 'CDI' }],
  channels: [],
  companies: [{ id: 'co1', profileId: 'P1', position: 10, name: 'Arte', description: '',
    ubicacion: '', lat: '48.5', lon: '7.7' }],
  questions: [{ id: 'q1', profileId: 'P1', applicationId: 'a1', position: 10,
    question: 'Pourquoi ?', answered: '', answer: 'Parce que' }],
  learnings: [], contacts: [],
  sites: [{ id: 'P1::veh::lacentrale', profileId: 'P1', domain: 'veh', siteKey: 'lacentrale',
    name: '', url: '', hecho: 'si', notas: 'vu' }],
  criteria: [
    { id: 'k1', profileId: 'P1', domain: 'veh', position: 10, label: 'Budget',
      detalle: '< 8000 €', importancia: 'Haute' },
    { id: 'k2', profileId: 'P1', domain: 'veh', position: 20, label: 'Fiabilité',
      detalle: '', importancia: 'Moyenne' },
    { id: 'k3', profileId: 'P1', domain: 'home', position: 10, label: 'Loyer',
      detalle: '', importancia: 'Haute' }
  ],
  vehModels: [{ id: 'm1', profileId: 'P1', position: 10, marca: 'Dacia', modelo: 'Sandero',
    motor: '1.0', anos: '2019+', precioMin: '7000', precioMax: '9000',
    imagen: 'https://ex.fr/s.jpg', notas: '' }],
  checks: [{ id: 'm1::k1', profileId: 'P1', domain: 'veh', subjectId: 'm1',
    criterionId: 'k1', verdict: 'oui', nota: '' }],
  vehOffers: [{ id: 'vo1', profileId: 'P1', modelId: 'm1', position: 10, fecha: '2026-08-28',
    titulo: 'Sandero 2019', vendedor: 'Garage', tipoVendedor: 'Garage / concession',
    precio: '8200', km: '62000', ano: '2019', estadoVeh: 'Occasion', controlTecnico: '',
    enlace: 'https://lc.fr/x', telefono: '', ubicacion: 'Kehl', estado: 'Contactée',
    nota: '8', notaComentario: '', proximaAccion: '' }],
  homeOffers: [{ id: 'ho1', profileId: 'P1', position: 10, fecha: '2026-08-28',
    titulo: 'T2 Krutenau', agencia: 'Orpi', tipoVendedor: 'Agence', alquiler: '650',
    cargas: '70', superficie: '45', piezas: '2', planta: '3e', muebles: 'Non meublé',
    dpe: 'D', disponible: 'octobre', enlace: 'https://sl.fr/x', telefono: '',
    ubicacion: 'rue de Zurich', lat: '48.58', lon: '7.75', estado: 'Visite prévue',
    nota: '9', notaComentario: '', proximaAccion: '' }],
  // A proposito, la lista de este anuncio esta A MEDIAS: solo una fila guardada.
  inspections: [{ id: 'vo1::0', profileId: 'P1', domain: 'veh', offerId: 'vo1',
    position: 10, item: 'Histovec', done: 'si', nota: '' }]
};

const calls = [];
global.fetch = function (url, opts) {
  const body = JSON.parse(opts.body);
  calls.push(body.action);
  let data = {};
  if (body.action === 'ping') data = { sheet: 'Feuille' };
  else if (body.action === 'listProfiles') data = { profiles: [PROFILE] };
  else if (body.action === 'loadProfile') data = DATA;
  else if (body.action.indexOf('upsert') === 0) data = { row: body.payload };
  return Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ ok: true, data }))
  });
};

store['estrasburgo.webAppUrl'] = 'https://script.google.com/macros/s/AAA/exec';
store['estrasburgo.profileId'] = 'P1';

let bootError = null;
try {
  new Function(appJs)();
} catch (e) { bootError = e; }

// ------------------------------------------------------------ las pruebas
(async () => {
  const ticks = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
  /** La cola de guardado espera 600 ms tras la ultima tecla: hay que dejarla salir. */
  const flushQueue = async () => { await new Promise(r => setTimeout(r, 900)); await ticks(10); };

  await ticks(40);

  console.log('\n== app.js arranca y pide sus datos ==');
  check('carga sin reventar', !bootError,
    bootError && bootError.message + ' | ' + bootError.stack.split('\n')[1]);
  check('no pide ni un id que no exista en el index.html',
    missing.size === 0, [...missing]);
  check('abre el perfil guardado sin preguntar',
    calls.indexOf('listProfiles') >= 0 && calls.indexOf('loadProfile') >= 0, calls);

  console.log('\n== los tres volets se pintan ==');
  check('el suivi de candidatures', H('tracking').indexOf('data-id="a1"') > 0);
  check('las questions, agrupadas por empresa', H('all-questions').indexOf('data-qgroup') > 0);
  check('los sitios de coche', H('veh-sites').indexOf('lacentrale') > 0);
  check('los sitios de vivienda', H('home-sites').indexOf('dossierfacile') > 0);
  check('los criterios, cada dominio con los suyos',
    (H('veh-criteria-body').match(/data-critid/g) || []).length === 2 &&
    (H('home-criteria-body').match(/data-critid/g) || []).length === 1);
  check('la rejilla de modelos, con una columna por criterio',
    H('veh-models').indexOf('data-vmid="m1"') > 0 &&
    (H('veh-models').match(/th-crit/g) || []).length === 2);
  check('la foto del modelo', H('veh-models').indexOf('ex.fr/s.jpg') > 0);
  check('el score del modelo', H('veh-models').indexOf('>1/2<') > 0, H('veh-models').match(/>\d\/\d</g));
  check('las annonces de coche', H('veh-offers').indexOf('data-void="vo1"') > 0);
  check('las annonces de vivienda', H('home-offers').indexOf('data-hoid="ho1"') > 0);
  check('el total loyer + charges calculado', H('home-offers').indexOf('= 720 €') > 0);
  check('la comparacion de viviendas', H('home-compare').indexOf('data-hoid="ho1"') > 0);
  check('las cifras de los dos volets',
    H('veh-stats').indexOf('stat-value') > 0 && H('home-stats').indexOf('stat-value') > 0);
  check('la pestana se recuerda', store['estrasburgo.tab'] === 'emploi', store['estrasburgo.tab']);

  console.log('\n== cambiar de pestana ==');
  fire('body', 'click', target({ 'data-tab': 'logement' },
    { '[data-tab]': { getAttribute: () => 'logement' } }));
  // El listener vive en document, no en body: se llama a mano.
  check('los volets existen para conmutarse', panes.length === 3);

  console.log('\n== la ficha de un coche ==');
  const trVeh = { getAttribute: (k) => (k === 'data-void' ? 'vo1' : null) };
  const btnVeh = target({ 'data-vofiche': '1' }, {});
  btnVeh.closest = (sel) => (sel === '[data-vofiche]' ? btnVeh : (sel === 'tr' ? trVeh : null));
  let e2 = null;
  try { fire('veh-offers', 'click', btnVeh); } catch (e) { e2 = e; }
  check('se abre sin reventar', !e2, e2 && e2.message + ' | ' + e2.stack.split('\n')[1]);
  check('el modal esta visible', els['veh-modal'].hidden === false);
  check('el titulo y el resumen', T('veh-modal-title') === 'Sandero 2019' &&
    T('veh-modal-sub').indexOf('8200') >= 0, T('veh-modal-sub'));
  check('los campos de la annonce', H('veh-modal-body').indexOf('data-vo="precio"') > 0 &&
    H('veh-modal-body').indexOf('data-vo="controlTecnico"') > 0);
  check('es una occasion: sale la lista de revision',
    H('veh-check-block').indexOf('rifier avant d') > 0);
  check('la lista sale entera aunque solo hubiera una fila guardada',
    (H('veh-insp').match(/data-inspid/g) || []).length >= 20,
    (H('veh-insp').match(/data-inspid/g) || []).length);
  check('el punto ya guardado sale marcado', H('veh-insp').indexOf('checked') > 0);
  check('el pie cuenta sobre la lista que se ve, no sobre lo guardado',
    /1 \/ 2\d points/.test(T('veh-modal-foot')), T('veh-modal-foot'));

  console.log('\n== marcar un punto de la lista ==');
  const antes = calls.length;
  const li = { getAttribute: () => 'vo1::5', classList: fakeEl('li').classList };
  const box = target({ 'data-insp': 'done' }, { '[data-inspid]': li },
    { checked: true, tagName: 'INPUT', type: 'checkbox' });
  let e3 = null;
  try { fire('veh-modal-body', 'change', box); } catch (e) { e3 = e; }
  await ticks(10);
  check('no revienta', !e3, e3 && e3.message + ' | ' + e3.stack.split('\n')[1]);
  check('la lista que faltaba se escribe de una vez (importRows)',
    calls.slice(antes).indexOf('importRows') >= 0, calls.slice(antes));
  check('y el punto marcado se ve', /2 \/ 2\d points/.test(T('veh-modal-foot')), T('veh-modal-foot'));

  console.log('\n== pasar la annonce a « Neuf » ==');
  const sel = target({ 'data-vo-sel': 'estadoVeh' }, {}, { tagName: 'SELECT', value: 'Neuf' });
  let e4 = null;
  try { fire('veh-modal-body', 'change', sel); } catch (e) { e4 = e; }
  check('no revienta', !e4, e4 && e4.message);
  check('el bloque cambia por los consejos de negociacion',
    H('veh-check-block').indexOf('gocie') > 0 && H('veh-check-block').indexOf('data-inspid') < 0);

  console.log('\n== la ficha de un logement ==');
  const trHome = { getAttribute: (k) => (k === 'data-hoid' ? 'ho1' : null) };
  const btnHome = target({ 'data-hofiche': '1' }, {});
  btnHome.closest = (sel2) => (sel2 === '[data-hofiche]' ? btnHome : (sel2 === 'tr' ? trHome : null));
  let e5 = null;
  try { fire('home-offers', 'click', btnHome); } catch (e) { e5 = e; }
  check('se abre sin reventar', !e5, e5 && e5.message + ' | ' + e5.stack.split('\n')[1]);
  check('el resumen suma loyer y charges', T('home-modal-sub').indexOf('720') >= 0,
    T('home-modal-sub'));
  check('los campos del logement', H('home-modal-body').indexOf('data-ho="alquiler"') > 0 &&
    H('home-modal-body').indexOf('data-ho-sel="dpe"') > 0);
  check('su propia carte', H('home-modal-body').indexOf('home-fiche-map') > 0);
  check('los criterios, uno por linea', H('home-crit-list').indexOf('data-critid="k3"') > 0);
  check('la lista de visita', (H('home-insp').match(/data-inspid/g) || []).length >= 20);
  check('el pie resume criterios y visita',
    T('home-modal-foot').indexOf('critères') > 0, T('home-modal-foot'));

  console.log('\n== un veredicto en la rejilla de modelos ==');
  const antes2 = calls.length;
  const tdV = { closest: () => ({ querySelector: () => null }) };
  const trV = { getAttribute: (k) => (k === 'data-vmid' ? 'm1' : null) };
  const selV = target({ 'data-crit': 'k2' }, {}, { tagName: 'SELECT', value: 'oui' });
  selV.closest = (s) => (s === 'tr' ? trV : (s === 'td' ? tdV : null));
  let e6 = null;
  try { fire('veh-models', 'change', selV); } catch (e) { e6 = e; }
  await flushQueue();
  check('no revienta', !e6, e6 && e6.message + ' | ' + e6.stack.split('\n')[1]);
  check('la casilla se guarda', calls.slice(antes2).indexOf('upsertCheck') >= 0, calls.slice(antes2));

  console.log('\n' + (fail || bootError
    ? (fail + (bootError ? 1 : 0)) + ' PRUEBA(S) FALLIDA(S)'
    : 'Arranque: ninguna prueba falla.'));
  process.exit(fail || bootError ? 1 : 0);
})();
