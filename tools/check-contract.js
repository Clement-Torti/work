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
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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

// ---------------------- 7. la recherche assistee par IA
// El circuito es: prompt -> el usuario lo pega en su IA -> vuelve un JSON ->
// se convierte en filas de la hoja. Lo unico que no se puede probar aqui es
// la IA; todo lo demas si, y conviene, porque un campo que no exista en el
// esquema se perderia sin decir nada.
console.log('\n== el prompt lleva todo lo que la IA necesita ==');

// Las funciones puras salen del propio app.js, entre sus dos marcas.
const IA_START = '  // --- IA: funciones puras';
const IA_END = '  // --- fin de las funciones puras de la IA';
const iaSrc = appJs.slice(appJs.indexOf(IA_START), appJs.indexOf(IA_END));
check('el bloque de funciones puras existe y esta delimitado',
  appJs.indexOf(IA_START) > 0 && appJs.indexOf(IA_END) > appJs.indexOf(IA_START));

const IA = new Function('ST_A_VALIDER', iaSrc +
  '\nreturn { buildAiPrompt: buildAiPrompt, parseAiOffers: parseAiOffers,' +
  ' buildImportPayload: buildImportPayload, normModalite: normModalite,' +
  ' normNote: normNote, normCoord: normCoord };')('À valider');

const prefs = { links: 'https://linkedin.com/in/moi\nhttps://mon-site.fr', extra: 'je vise des PME',
  ville: 'Colmar', rayon: '25', salaire: '29000', contrat: 'CDI',
  teletravail: 'Hybride', jours: '15', max: '7' };
const ctxPrompt = {
  jobTypes: [
    { id: 'jt1', tipo: 'Marketing digital', porQue: 'mon parcours', nivelFrances: 'Intermédiaire (B1-B2)', prioridad: 'Haute' },
    { id: 'jt2', tipo: 'Service client bilingue', porQue: '', nivelFrances: '', prioridad: 'Basse' }
  ],
  applications: [
    { empresa: 'Ubisoft', puesto: 'Chef de projet', enlace: 'https://offre.fr/1' },
    { empresa: '', puesto: '', enlace: '' }
  ]
};
const prompt = IA.buildAiPrompt(prefs, ctxPrompt);

check('lleva los enlaces del perfil',
  prompt.includes('https://linkedin.com/in/moi') && prompt.includes('https://mon-site.fr'));
check('lleva el campo libre', prompt.includes('je vise des PME'));
check('lleva los tipos de puesto con su contexto',
  prompt.includes('Marketing digital') && prompt.includes('mon parcours') &&
  prompt.includes('Service client bilingue'));
check('lleva los criterios', prompt.includes('Colmar') && prompt.includes('25 km') &&
  prompt.includes('29000') && prompt.includes('CDI') && prompt.includes('Hybride') &&
  prompt.includes('15 jours'));
check('lleva el maximo de ofertas pedido', /7 offres au maximum/.test(prompt));
check('lleva lo que ya esta en el suivi, para no repetirlo',
  prompt.includes('Ubisoft') && prompt.includes('Chef de projet') && prompt.includes('https://offre.fr/1'));
check('no mete lineas vacias por las candidaturas sin nombre',
  (prompt.match(/^- \? — poste non pr/gm) || []).length === 0);
check('pide el JSON con todas las claves del formato',
  ['"offres"', '"typeDePoste"', '"poste"', '"lien"', '"source"', '"datePublication"',
   '"salaire"', '"modalite"', '"missions"', '"avantages"', '"note"', '"pourquoiCetteNote"',
   '"entreprise"', '"questionsProbables"', '"aSavoir"', '"contacts"']
  .every(k => prompt.includes(k)));
check('prohibe inventar', /N’invente RIEN/.test(prompt));
// El ejemplo que le damos es la forma que la IA va a copiar: si el ejemplo no
// es JSON valido, su respuesta tampoco lo sera.
let ejemplo = '';
prompt.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (_, inner) => {
  if (inner.trim().length > ejemplo.length) ejemplo = inner.trim();
  return '';
});
let ejemploOk = false, ejemploErr = '';
try { ejemploOk = Array.isArray(JSON.parse(ejemplo).offres); }
catch (e) { ejemploErr = e.message; }
check('el ejemplo de JSON del prompt es JSON valido', ejemploOk, ejemploErr);
check('el ejemplo del prompt entra por el propio lector de respuestas',
  (IA.parseAiOffers(prompt.slice(prompt.indexOf('```json'))).offers || []).length === 1);
check('el ejemplo cubre las cinco tablas de la hoja', ejemploOk &&
  ['entreprise', 'questionsProbables', 'aSavoir', 'contacts', 'poste']
    .every(k => k in JSON.parse(ejemplo).offres[0]));
check('nombra varias plataformas francesas',
  ['France Travail', 'LinkedIn', 'Indeed', 'HelloWork', 'Welcome to the Jungle', 'APEC']
  .every(k => prompt.includes(k)));

// sin criterios opcionales, el prompt no inventa lineas
const promptMin = IA.buildAiPrompt(
  { links: '', extra: '', ville: '', rayon: '', salaire: '', contrat: 'Peu importe',
    teletravail: 'Peu importe', jours: '', max: '' }, ctxPrompt);
check('sin enlaces, lo dice en vez de dejar un hueco',
  /Je ne t’ai donné aucun lien/.test(promptMin));
check('sin salario, no aparece la linea', !/Salaire minimum/.test(promptMin));
check('"peu importe" no se manda a la IA',
  !/Type de contrat/.test(promptMin) && !/Présence sur place/.test(promptMin));
check('el maximo por defecto es 10', /10 offres au maximum/.test(promptMin));

console.log('\n== la respuesta de la IA se lee en todas sus formas ==');
const OFFER = '{"offres":[{"poste":"Dev","entreprise":{"nom":"Arte"}}]}';
check('bloque ```json', (IA.parseAiOffers('Voici :\n```json\n' + OFFER + '\n```\nBonne chance !').offers || []).length === 1);
check('bloque ``` sin la palabra json', (IA.parseAiOffers('```\n' + OFFER + '\n```').offers || []).length === 1);
check('objeto a pelo', (IA.parseAiOffers(OFFER).offers || []).length === 1);
check('con frases alrededor', (IA.parseAiOffers('J’ai trouve ceci : ' + OFFER + ' voila.').offers || []).length === 1);
check('el array a pelo tambien vale', (IA.parseAiOffers('[{"poste":"Dev"}]').offers || []).length === 1);
check('lista vacia no es un error', Array.isArray(IA.parseAiOffers('{"offres":[]}').offers));
check('texto vacio: error claro', /Colle d’abord/.test(IA.parseAiOffers('   ').error || ''));
check('JSON roto: error claro', /pas du JSON valide/.test(IA.parseAiOffers('{"offres": [').error || ''));
check('JSON sin lista: error claro', /liste/.test(IA.parseAiOffers('{"resultat":"rien"}').error || ''));

console.log('\n== las ofertas se convierten en filas de la hoja ==');
const ctxImp = {
  profileId: 'P1',
  jobTypes: ctxPrompt.jobTypes,
  applications: [
    { id: 'a0', jobTypeId: 'jt1', position: 30, empresa: 'Ubisoft', puesto: 'Chef de projet', enlace: 'https://offre.fr/1' }
  ],
  companies: [{ id: 'c0', position: 10, name: 'Ubisoft' }],
  today: '2026-08-26',
  uid: (() => { let n = 0; return () => 'new-' + (++n); })()
};

const offers = [
  { typeDePoste: 'Marketing digital', poste: 'Chargé de com', lien: 'https://offre.fr/2',
    source: 'Indeed', datePublication: '2026-08-20', salaire: '30-34 k€',
    modalite: 'full remote', missions: 'Community management', avantages: 'Tickets resto',
    adresse: '2 rue X, Colmar', lat: '48,08', lon: '7.35', note: '8/10',
    pourquoiCetteNote: 'Bien payé mais missions floues',
    entreprise: { nom: 'Arte', description: 'Chaîne culturelle', adresse: '4 quai du Chanoine Winterer, Strasbourg', lat: '48.5901', lon: '7.7620' },
    questionsProbables: ['Pourquoi Arte ?', '  ', 'Ton niveau de français ?'],
    aSavoir: ['Process en 3 entretiens'],
    contacts: [{ nom: 'Marie', role: 'RH', email: 'marie@arte.tv', telephone: '' }, { nom: '', role: '' }] },
  // el tipo de puesto no existe: cae en el primero, con aviso
  { typeDePoste: 'Data science', poste: 'Analyste', lien: 'https://offre.fr/3',
    entreprise: { nom: 'CTS' }, modalite: 'sur place', note: '42' },
  // duplicado por enlace
  { poste: 'Autre chose', lien: 'https://offre.fr/1', entreprise: { nom: 'Ailleurs' } },
  // duplicado por empresa + puesto
  { poste: 'Chef de projet', entreprise: { nom: 'ubisoft  ' } },
  // vacia
  { entreprise: {} },
  // empresa que ya existe: no se duplica la ficha de empresa
  { typeDePoste: 'Service client bilingue', poste: 'Conseiller', lien: 'https://offre.fr/4',
    entreprise: { nom: 'Ubisoft', description: 'no deberia pisar la existente' } }
];

const built = IA.buildImportPayload(offers, ctxImp);
check('devuelve un payload', !built.error, built.error);
const P = built.payload, R = built.report;

check('3 candidaturas nuevas, 3 descartadas', P.applications.length === 3 && R.skipped.length === 3,
  { apps: P.applications.length, skipped: R.skipped });
check('los motivos del descarte se explican',
  R.skipped.every(s => s.why) && R.skipped.some(s => /lien/.test(s.why)) &&
  R.skipped.some(s => /déjà dans ton suivi/.test(s.why)) &&
  R.skipped.some(s => /ni entreprise ni poste/.test(s.why)), R.skipped);

const arte = P.applications[0];
check('todas llegan como « À valider »',
  P.applications.every(a => a.estado === 'À valider'), P.applications.map(a => a.estado));
check('la fecha es la del dia', P.applications.every(a => a.fecha === '2026-08-26'));
check('el perfil se propaga a todo',
  [].concat(P.companies, P.applications, P.questions, P.learnings, P.contacts)
    .every(r => r.profileId === 'P1'));
check('el tipo de puesto se resuelve por su nombre', arte.jobTypeId === 'jt1');
check('un tipo desconocido cae en el primero y se avisa',
  P.applications[1].jobTypeId === 'jt1' && R.warnings.some(w => /Data science/.test(w)), R.warnings);
check('la posicion continua tras las filas que ya existen', arte.position === 40, arte.position);
check('"full remote" se traduce a la lista cerrada', arte.modalidad === 'Télétravail', arte.modalidad);
check('"sur place" tambien', P.applications[1].modalidad === 'Présentiel');
check('la nota "8/10" queda en "8"', arte.nota === '8', arte.nota);
check('una nota imposible se tira', P.applications[1].nota === '', P.applications[1].nota);
check('la coma decimal se arregla', arte.lat === '48.08', arte.lat);
check('el porque de la nota se guarda', /Bien pay/.test(arte.notaComentario));

check('una entreprise nueva por oferta nueva, sin repetir la que ya existia',
  P.companies.length === 2 && P.companies.map(c => c.name).join(',') === 'Arte,CTS',
  P.companies.map(c => c.name));
check('no se pisa la ficha de una empresa que ya existe',
  !P.companies.some(c => /no deberia pisar/.test(c.description || '')));
check('la empresa nueva guarda su direccion y su punto',
  P.companies[0].ubicacion.indexOf('Winterer') > 0 && P.companies[0].lat === '48.5901');

check('las preguntas cuelgan de su candidatura y se limpian los huecos',
  P.questions.length === 2 && P.questions.every(q => q.applicationId === arte.id), P.questions);
check('la fuente y la fecha de publicacion se apuntan como info',
  P.learnings.some(l => /Indeed/.test(l.note) && /2026-08-20/.test(l.note)), P.learnings);
check('lo que la IA sabe entra tambien', P.learnings.some(l => /3 entretiens/.test(l.note)));
check('un contacto vacio no crea fila',
  P.contacts.length === 1 && P.contacts[0].email === 'marie@arte.tv', P.contacts);

check('sin tipos de puesto, se explica en vez de fallar',
  /Ajoute d’abord un type de poste/.test(
    (IA.buildImportPayload(offers, Object.assign({}, ctxImp, { jobTypes: [] })).error) || ''));

// -------- las filas tienen que encajar EXACTAMENTE con el esquema de la hoja
console.log('\n== las filas importadas encajan con el esquema de la hoja ==');
function schemaCols(table) {
  const block = codeGs.slice(codeGs.indexOf('var SCHEMA'), codeGs.indexOf('var CHILDREN'));
  const line = block.slice(block.indexOf('\n  ' + table + ':'));
  return [...line.slice(0, line.indexOf('],')).matchAll(/'(\w+)'/g)].map(m => m[1]);
}
[['companies', 'Applications' && 'Companies'], ['applications', 'Applications'],
 ['questions', 'Questions'], ['learnings', 'Learnings'], ['contacts', 'Contacts']]
.forEach(([key, table]) => {
  const cols = schemaCols(table);
  const rows = P[key];
  const sobran = uniq([].concat(...rows.map(r => Object.keys(r).filter(k => !cols.includes(k)))));
  const faltan = uniq([].concat(...rows.map(r => cols.filter(c => !(c in r)))));
  check(key + ': ningun campo que la hoja no tenga', sobran.length === 0, sobran);
  check(key + ': ningun campo del esquema olvidado', faltan.length === 0, faltan);
});

// ------- el circuito completo: JSON de la IA -> filas -> hoja -> loadProfile
// Aqui no hay payload escrito a mano: el que viaja es el que construye la
// pagina. Es la unica prueba que cubre la costura entre las dos mitades.
console.log('\n== de la respuesta de la IA a la hoja, sin escalas ==');

const C = call('createProfile', { name: 'Nora' }).data.profile;
call('upsertJobType', { id: 'jtC', profileId: C.id, position: 10, tipo: 'Marketing digital' });

const respuestaIA = 'Voici ce que j’ai trouvé :\n\n```json\n' + JSON.stringify({
  offres: [{
    typeDePoste: 'Marketing digital', poste: 'Chargé de com', lien: 'https://offre.fr/9',
    source: 'Indeed', datePublication: '2026-08-20', salaire: '30-34 k€',
    modalite: 'hybride', missions: 'Community management', avantages: 'Tickets resto',
    adresse: '2 rue X, Strasbourg', lat: '48.58', lon: '7.75',
    note: '8', pourquoiCetteNote: 'Bien payé mais missions floues',
    entreprise: { nom: 'Arte', description: 'Chaîne culturelle', adresse: '4 quai Winterer', lat: '48.59', lon: '7.76' },
    questionsProbables: ['Pourquoi Arte ?'],
    aSavoir: ['Process en 3 entretiens'],
    contacts: [{ nom: 'Marie', role: 'RH', email: 'marie@arte.tv', telephone: '' }]
  }]
}, null, 2) + '\n```\n\nBonne chance !';

const leido = IA.parseAiOffers(respuestaIA);
check('la respuesta de la IA se lee', (leido.offers || []).length === 1, leido.error);

const real = IA.buildImportPayload(leido.offers, {
  profileId: C.id, jobTypes: [{ id: 'jtC', tipo: 'Marketing digital' }],
  applications: [], companies: [], today: '2026-08-26',
  uid: (() => { let n = 0; return () => 'e2e-' + (++n); })()
});
check('se convierte en filas', !real.error && real.report.kept.length === 1, real.error);

const payloadReal = Object.assign({ profileId: C.id }, real.payload);
let ri = call('importOffers', payloadReal);
check('la hoja lo acepta y cuenta las filas',
  ri.ok === true && ri.data.rows === 6, ri);   // 1 empresa + 1 cand. + 1 pregunta + 2 infos + 1 contacto

const dd = call('loadProfile', { profileId: C.id }).data;
check('la candidatura llega con su estado « À valider »',
  dd.applications.length === 1 && dd.applications[0].estado === 'À valider', dd.applications);
check('nada se pierde por el camino', dd.applications[0].puesto === 'Chargé de com' &&
  dd.applications[0].enlace === 'https://offre.fr/9' &&
  dd.applications[0].modalidad === 'Hybride' &&
  dd.applications[0].nota === '8' &&
  /Bien pay/.test(dd.applications[0].notaComentario) &&
  dd.applications[0].sueldo === '30-34 k€', dd.applications[0]);
check('la empresa entra con su direccion',
  dd.companies.length === 1 && dd.companies[0].name === 'Arte' &&
  dd.companies[0].lat === '48.59', dd.companies);
check('el detalle cuelga de la candidatura',
  dd.questions.length === 1 && dd.learnings.length === 2 && dd.contacts.length === 1 &&
  dd.questions[0].applicationId === dd.applications[0].id &&
  dd.contacts[0].email === 'marie@arte.tv',
  { q: dd.questions, l: dd.learnings, c: dd.contacts });
check('la fuente y la fecha quedan apuntadas como info',
  /Indeed/.test(dd.learnings[0].note) && /2026-08-20/.test(dd.learnings[0].note), dd.learnings[0]);

check('reimportar el mismo payload no duplica (upsert por id)',
  (call('importOffers', payloadReal),
   call('loadProfile', { profileId: C.id }).data.applications.length === 1));
check('un payload vacio se rechaza', call('importOffers', { profileId: C.id }).ok === false);
const enorme = { profileId: C.id, applications: [] };
for (let i = 0; i < 601; i++) enorme.applications.push({ id: 'x' + i, profileId: C.id });
check('un payload enorme se rechaza en vez de colgar la hoja',
  call('importOffers', enorme).ok === false);

// La segunda vuelta ya no debe proponer lo mismo: el prompt lo lleva excluido.
const prompt2 = IA.buildAiPrompt(prefs, { jobTypes: ctxPrompt.jobTypes, applications: dd.applications });
check('la siguiente busqueda excluye lo que se acaba de importar',
  prompt2.includes('Chargé de com') && prompt2.includes('https://offre.fr/9'));
const otraVez = IA.buildImportPayload(leido.offers, {
  profileId: C.id, jobTypes: [{ id: 'jtC', tipo: 'Marketing digital' }],
  applications: dd.applications, companies: dd.companies, today: '2026-08-26', uid: () => 'z'
});
check('y si la IA insiste, el import la descarta sola',
  otraVez.report.kept.length === 0 && /déjà/.test(otraVez.report.skipped[0].why),
  otraVez.report.skipped);

console.log('\n== las offres masquees salen de la tabla sin borrarse ==');
check('el filtro existe y cubre refusees y ecartees',
  /var STATUTS_CACHES = \['Refus\\u00e9e', ST_ECARTEE\]/.test(appJs), 'STATUTS_CACHES');
check('los dos estados nuevos estan en la lista del select',
  /value: ST_A_VALIDER/.test(appJs) && /value: ST_ECARTEE/.test(appJs));
check('ninguno de los dos cuenta como "ya enviada"',
  !/STATUTS_ENVOYES = \[[^\]]*valider/.test(appJs) &&
  !/STATUTS_ENVOYES = \[[^\]]*ECARTEE/.test(appJs));
check('la tabla pinta solo lo visible', /rows = visibleApps\(all\)/.test(appJs));
check('la ficha ofrece guardar o descartar',
  /data-app-keep/.test(appJs) && /data-app-drop/.test(appJs));
check('descartar no borra la fila: solo cambia el estado',
  /app\.estado = e\.target\.getAttribute\('data-app-drop'\) \? ST_ECARTEE : ''/.test(appJs));
check('hay un boton para revelarlas', /data-toggle-hidden/.test(appJs));

// ------------- 8. la fiche: la lettre et les reponses se replient
// Un pliegue cerrado tiene scrollHeight 0: si no se mide al abrirlo, un texto
// largo aparece en una sola linea. Y el resumen de la cabecera es lo unico
// que se ve cerrado, asi que tiene que decir algo util.
console.log('\n== la lettre et les réponses partent repliées ==');

function renderQuestionsFiche(questions, openFolds) {
  const i = appJs.indexOf('  function renderMdQuestions()');
  const body = appJs.slice(i, appJs.indexOf("\n  }\n", appJs.indexOf('autoGrowAll(', i)) + 4);
  const helpers = appJs.slice(appJs.indexOf('  function foldHtml('),
                              appJs.indexOf('\n  }\n', appJs.indexOf('  function peek(')) + 4);
  const box = { innerHTML: '' };
  const env = {
    openFolds, openAppId: 'A1',
    state: { questions: questions },
    REPONDU: [],
    $: () => box,
    esc: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    forApp: (rows, id) => rows.filter(r => r.applicationId === id),
    selectHtml: () => '<select></select>',
    autoGrowAll: () => {}
  };
  const keys = Object.keys(env);
  new Function(...keys, helpers + body + '\nrenderMdQuestions();')(...keys.map(k => env[k]));
  return box.innerHTML;
}

const qs = [
  { id: 'q1', applicationId: 'A1', question: 'Pourquoi nous ?', answered: '',
    answer: 'Parce que le produit me parle et que j’ai déjà fait ce métier ailleurs, longuement.' },
  { id: 'q2', applicationId: 'A1', question: 'Tes prétentions ?', answered: 'non', answer: '' }
];
let fh = renderQuestionsFiche(qs, {});

check('cada respuesta vive en su propio pliegue',
  (fh.match(/data-fold="answer:q1"/g) || []).length === 1 &&
  (fh.match(/data-fold="answer:q2"/g) || []).length === 1);
check('los pliegues empiezan cerrados', !/data-fold="answer:[^"]+"\s+open/.test(fh), fh.slice(0, 400));
check('la respuesta esta dentro del pliegue, no fuera',
  fh.indexOf('data-mq="answer"') > fh.indexOf('data-fold="answer:q1"') &&
  fh.indexOf('data-mq="answer"') < fh.indexOf('</details>'));
check('la pregunta sigue a la vista, fuera del pliegue',
  fh.indexOf('data-mq="question"') < fh.indexOf('data-fold="answer:q1"'));
check('cerrado se ve un trozo de la respuesta',
  /Parce que le produit me parle/.test(fh) && /…<\/span>/.test(fh), fh.match(/md-fold-meta">[^<]*/g));
check('el resumen no es mas largo que el limite',
  (fh.match(/md-fold-meta">([^<]*)</g) || []).every(m => m.length - 16 <= 46),
  fh.match(/md-fold-meta">[^<]*/g));
check('una respuesta vacia lo dice', /md-fold-meta">à écrire</.test(fh));
check('el select de « su répondre ? » no se pliega',
  fh.indexOf('<select></select>') > fh.indexOf('</details>'));

fh = renderQuestionsFiche(qs, { 'answer:q2': true });
check('lo que estaba abierto se vuelve a pintar abierto',
  /data-fold="answer:q2" open/.test(fh) && !/data-fold="answer:q1" open/.test(fh));

console.log('\n== la lettre de motivation ==');
check('la lettre esta dentro de un pliegue', /foldHtml\('lettre', 'Lettre de motivation'/.test(appJs));
check('el textarea de la lettre sigue siendo el mismo campo',
  /foldHtml\('lettre'[\s\S]{0,300}data-af="cartaMotivacion"/.test(appJs));
check('cerrada, dice cuanto hay escrito',
  /caract\\u00e8res/.test(appJs.slice(appJs.indexOf("foldHtml('lettre'"),
                                     appJs.indexOf("foldHtml('lettre'") + 400)));
check('el resumen se actualiza al teclear', /foldMeta\(t, t\.value \? String\(t\.value\)\.length/.test(appJs));
check('abrir un pliegue mide los textarea que lleva dentro',
  /details\.md-fold[\s\S]{0,300}autoGrowAll\(det\)/.test(appJs));
check('el pliegue recuerda su estado en openFolds',
  /openFolds\[key\] = true/.test(appJs) && /delete openFolds\[key\]/.test(appJs));

const rPrintFold = css.slice(css.indexOf('@media print'));
check('en papel los pliegues cerrados se abren',
  /\.md-fold:not\(\[open\]\) > \.md-fold-body/.test(rPrintFold), rPrintFold);

const rFoldHead = (() => {
  const i = css.indexOf('\n.md-fold-head {');
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
})();
check('la cabecera del pliegue esconde el marcador del navegador',
  /list-style:\s*none/.test(rFoldHead), rFoldHead);

// ---------- 9. nada de lo que se escribe se puede perder en silencio
// Existe por un fallo real y desagradable: al anadir las columnas
// notaComentario y cartaMotivacion, una hoja con el Code.gs anterior aun
// desplegado respondia "ok", tiraba esos dos campos y la pagina decia
// "Enregistré". El texto desaparecia al recargar, sin un solo aviso.
console.log('\n== todo campo editable se guarda solo ==');

const HOOKS = ['data-field', 'data-cfield', 'data-cofield', 'data-af', 'data-af-sel',
               'data-mq', 'data-mq-sel', 'data-ml', 'data-mc', 'data-qfield', 'data-qsel'];

const controles = [...appJs.matchAll(/<(input|textarea|select)\b[^>]*/g)]
  .map(m => m[0])
  .filter(t => !/type="(button|submit)"/.test(t));

const sinHook = controles.filter(t => !HOOKS.some(h => t.indexOf(h + '=') >= 0));
// md-address es la excepcion: se guarda por su propio listener, no por data-*.
const excepciones = sinHook.filter(t => t.indexOf('id="md-address"') >= 0);
check('ningun campo pintado sin engancharse al guardado',
  sinHook.length === excepciones.length,
  sinHook.filter(t => t.indexOf('id="md-address"') < 0).map(t => t.slice(0, 70)));
check('la direccion de la ficha se guarda al teclear (no solo con «Chercher»)',
  /\$\('md-address'\)\.addEventListener\('input'[\s\S]{0,260}enqueue\('app:'/.test(appJs));
check('los cuatro grupos de campos de la ficha tienen su listener',
  ['data-af', 'data-mq', 'data-ml', 'data-mc'].every(h =>
    appJs.indexOf("getAttribute('" + h + "')") > 0));

console.log('\n== una hoja con un Code.gs viejo se detecta y se avisa ==');

// La deteccion, sacada de app.js y ejercitada con un espia.
const detSrc = appJs.slice(appJs.indexOf('  var droppedWarned = {};'),
  appJs.indexOf('\n  }\n', appJs.indexOf('  function warnIfFieldsDropped(')) + 4);
let avisos = [];
const detectar = new Function('showBanner',
  detSrc + '\nreturn warnIfFieldsDropped;')((id, msg) => avisos.push({ id: id, msg: msg }));

// Lo que responderia la hoja vieja: ok, pero sin las dos columnas nuevas.
const enviado = { id: 'a1', empresa: 'Arte', notaComentario: 'Bien payé mais stressant',
  cartaMotivacion: 'Madame, Monsieur…' };
const devueltoViejo = { id: 'a1', empresa: 'Arte' };
detectar({ action: 'upsertApplication', payload: enviado }, { row: devueltoViejo });
check('avisa, y en su propio banner', avisos.length === 1 && avisos[0].id === 'stale-backend', avisos);
check('nombra los dos campos perdidos',
  /notaComentario/.test(avisos[0].msg) && /cartaMotivacion/.test(avisos[0].msg));
check('dice exactamente que hacer, incluido lo que no basta',
  /Nouvelle version/.test(avisos[0].msg) && /ne suffit pas/.test(avisos[0].msg), avisos[0].msg);
check('tranquiliza sobre el resto', /reste de tes données/.test(avisos[0].msg));

avisos = [];
detectar({ action: 'upsertApplication', payload: enviado },
  { row: { id: 'a1', empresa: 'Arte', notaComentario: 'Bien payé mais stressant',
           cartaMotivacion: 'Madame, Monsieur…' } });
check('con la hoja al dia, ni un aviso', avisos.length === 0, avisos);

avisos = [];
detectar({ action: 'upsertApplication', payload: { id: 'a1', notaComentario: '   ' } },
  { row: { id: 'a1' } });
check('un campo vacio no molesta a nadie', avisos.length === 0, avisos);

avisos = [];
detectar({ action: 'deleteApplication', payload: { id: 'a1' } }, { removed: true });
check('un borrado no dispara la deteccion', avisos.length === 0, avisos);

// Y el escenario completo contra el simulador, con el esquema de antes.
// El esquema de "antes": se recorta todo lo que venga despues de 'lon', asi la
// prueba sigue valiendo cada vez que se anada una columna.
const viejoGs = codeGs.replace(/'ubicacion', 'lat', 'lon',[^\]]*\]/, "'ubicacion', 'lat', 'lon']");
check('el esquema viejo se ha podido reconstruir para la prueba', viejoGs !== codeGs);

const guardar = global.SpreadsheetApp;
const hojasViejas = new Map();
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getName: () => 'Vieja', getSheetByName: (n) => hojasViejas.get(n) || null,
  insertSheet: (n) => { const sh = makeSheet(); hojasViejas.set(n, sh); return sh; } }) };
const postViejo = new Function(viejoGs + '\nreturn doPost;')();
const callViejo = (a, p) => JSON.parse(postViejo({ postData: { contents: JSON.stringify({ action: a, payload: p }) } })._t);

const pViejo = callViejo('createProfile', { name: 'Antes' }).data.profile;
const filaCompleta = { id: 'ap1', profileId: pViejo.id, jobTypeId: 'jt', position: 10,
  fecha: '2026-08-26', empresa: 'Arte', puesto: 'Dev', fuente: '', estado: '',
  proximaAccion: '', enlace: '', nota: '8', misiones: '', sueldo: '', modalidad: '',
  ventajas: '', ubicacion: '', lat: '', lon: '',
  notaComentario: 'Bien payé mais stressant', cartaMotivacion: 'Madame, Monsieur…' };
const rv = callViejo('upsertApplication', filaCompleta);
check('la hoja vieja responde ok (de ahi el « Enregistré » enganoso)', rv.ok === true, rv);
check('y devuelve la fila sin las columnas nuevas',
  ['notaComentario', 'cartaMotivacion', 'contrato'].every(k => !(k in rv.data.row)),
  Object.keys(rv.data.row));
const releido = callViejo('loadProfile', { profileId: pViejo.id }).data.applications[0];
check('al recargar, el texto ya no esta (el fallo que se ha reportado)',
  !releido.notaComentario && !releido.cartaMotivacion, releido);
check('lo demas si estaba guardado', releido.nota === '8' && releido.empresa === 'Arte');

avisos = [];
detectar({ action: 'upsertApplication', payload: filaCompleta }, rv.data);
check('la pagina lo habria dicho en vez de callarse', avisos.length === 1, avisos);
global.SpreadsheetApp = guardar;

// Con el Code.gs del repositorio, el mismo envio no pierde nada.
const pNuevo = call('createProfile', { name: 'Ahora' }).data.profile;
const rn = call('upsertApplication', Object.assign({}, filaCompleta, { profileId: pNuevo.id }));
avisos = [];
detectar({ action: 'upsertApplication', payload: filaCompleta }, rn.data);
check('con el Code.gs de este repositorio no se pierde nada', avisos.length === 0, avisos);
check('y el texto vuelve entero',
  call('loadProfile', { profileId: pNuevo.id }).data.applications[0].cartaMotivacion === 'Madame, Monsieur…');

// ------- 10. type de contrat, choix multiples, et un modal utilisable
console.log('\n== le type de contrat suit la candidature ==');

const colsApp = (() => {
  const block = codeGs.slice(codeGs.indexOf('var SCHEMA'), codeGs.indexOf('var CHILDREN'));
  const line = block.slice(block.indexOf('\n  Applications:'));
  return [...line.slice(0, line.indexOf('],')).matchAll(/'(\w+)'/g)].map(m => m[1]);
})();
check('la hoja tiene su columna, y al final', colsApp[colsApp.length - 1] === 'contrato', colsApp);
check('la ficha lo pide con una lista cerrada',
  /fieldBlock\('Type de contrat', selectHtml\(CONTRATS/.test(appJs));
check('una candidatura nueva lo lleva vacio', /contrato: ''/.test(appJs));
check('el select se colorea con su propia lista',
  /AF_LISTS = \{ nota: NOTES, modalidad: MODALITES, contrato: CONTRATS \}/.test(appJs));

// lo que escriba la IA se trae a la lista cerrada
const CONTRAT_CASOS = [
  ['CDI', 'CDI'], ['contrat à durée indéterminée', 'CDI'], ['CDD 6 mois', 'CDD'],
  ['contrat à durée déterminée', 'CDD'], ['alternance', 'Alternance'],
  ['contrat d’apprentissage', 'Alternance'], ['intérim', 'Intérim'],
  ['mission d’intérim', 'Intérim'], ['stage de fin d’études', 'Stage'],
  ['internship', 'Stage'], ['freelance', 'Freelance'], ['portage salarial', 'Freelance'],
  ['', ''], ['temps plein', '']
];
const iaSrc2 = appJs.slice(appJs.indexOf('  // --- IA: funciones puras'),
                           appJs.indexOf('  // --- fin de las funciones puras de la IA'));
const IA2 = new Function('ST_A_VALIDER', iaSrc2 +
  '\nreturn { normContrat: normContrat, buildAiPrompt: buildAiPrompt,' +
  ' buildImportPayload: buildImportPayload, choices: choices };')('À valider');

const malos = CONTRAT_CASOS.filter(([entra, sale]) => IA2.normContrat(entra) !== sale);
check('lo que escriba la IA cae en la lista cerrada', malos.length === 0,
  malos.map(([e, s]) => e + ' -> ' + IA2.normContrat(e) + ' (esperado ' + s + ')'));

const impC = IA2.buildImportPayload(
  [{ poste: 'Dev', lien: 'https://o/1', contrat: 'CDI', entreprise: { nom: 'Arte' } },
   { poste: 'Stagiaire', lien: 'https://o/2', contrat: 'stage 6 mois', entreprise: { nom: 'CTS' } }],
  { profileId: 'P', jobTypes: [{ id: 'j', tipo: 'Dev' }], applications: [], companies: [],
    today: '2026-08-26', uid: (() => { let n = 0; return () => 'c' + (++n); })() });
check('el contrato llega a la candidatura importada',
  impC.payload.applications[0].contrato === 'CDI' &&
  impC.payload.applications[1].contrato === 'Stage',
  impC.payload.applications.map(a => a.contrato));

const promptC = IA2.buildAiPrompt(
  { links: '', extra: '', ville: 'Strasbourg', rayon: '', salaire: '', contrat: '', teletravail: '', jours: '', max: '5' },
  { jobTypes: [{ tipo: 'Dev' }], applications: [] });
check('el prompt pide el contrato y lo limita', /"contrat"/.test(promptC) &&
  /"contrat" : uniquement/.test(promptC));
check('el ejemplo del prompt sigue siendo JSON valido', (() => {
  let e = '';
  promptC.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (_, i2) => { if (i2.trim().length > e.length) e = i2.trim(); return ''; });
  try { return 'contrat' in JSON.parse(e).offres[0]; } catch (err) { return false; }
})());

console.log('\n== plusieurs choix pour contrat et présence ==');
check('contrat es un grupo de casillas, no un select',
  /id="ai-contrat" class="chips" data-ai-multi/.test(html) &&
  !/<select id="ai-contrat"/.test(html));
check('présence también', /id="ai-teletravail" class="chips" data-ai-multi/.test(html) &&
  !/<select id="ai-teletravail"/.test(html));
check('las seis clases de contrato estan',
  ['CDI', 'CDD', 'Alternance', 'Intérim', 'Stage', 'Freelance']
    .every(v => html.indexOf('value="' + v + '"') > 0));
check('la pagina sabe que esos dos campos son multiples',
  /AI_MULTI = \['contrat', 'teletravail'\]/.test(appJs));
check('se guardan como lista y se releen marcando las casillas',
  /function aiMultiValue/.test(appJs) && /function setAiMultiValue/.test(appJs) &&
  /out\.join\(', '\)/.test(appJs));
check('nada marcado = sin filtro, no «peu importe» escrito a mano',
  IA2.choices('').length === 0 && IA2.choices('Peu importe').length === 0);

const promptMulti = IA2.buildAiPrompt(
  { links: '', extra: '', ville: 'Colmar', rayon: '', salaire: '',
    contrat: 'CDI, Alternance', teletravail: 'Hybride, Télétravail', jours: '', max: '5' },
  { jobTypes: [{ tipo: 'Dev' }], applications: [] });
check('el prompt junta las opciones con « ou »',
  /- Type de contrat : CDI ou Alternance/.test(promptMulti) &&
  /- Présence sur place : Hybride ou Télétravail/.test(promptMulti),
  promptMulti.slice(promptMulti.indexOf('## 3'), promptMulti.indexOf('## 4')));
check('y avisa a la IA de que cualquiera vale',
  /n’importe lequel des 2/.test(promptMulti) && /l’un ou l’autre/.test(promptMulti));

console.log('\n== el modal se puede usar en una pantalla baja ==');
check('el boton de importar esta FUERA del cuerpo que scrollea',
  html.indexOf('id="ai-import"') > html.indexOf('class="modal-foot"'),
  { import: html.indexOf('id="ai-import"'), foot: html.indexOf('class="modal-foot"') });
check('el pie esta dentro del panel, hermano del cuerpo',
  /<\/div>\s*<!--[\s\S]*?-->\s*<footer class="modal-foot">/.test(html));

const rFoot = (() => { const i = css.indexOf('\n.modal-foot {'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); })();
check('el pie no se encoge ni scrollea', /flex:\s*none/.test(rFoot), rFoot);
check('el modal mide el alto visible de verdad (dvh) en el movil',
  /@supports \(height: 100dvh\)[\s\S]{0,80}\.modal \{ height: 100dvh/.test(css));
check('el prompt y el JSON no se comen la pantalla',
  /max-height:\s*38vh/.test(css));
// app.js es ASCII puro: los acentos viven como \uXXXX.
check('el pie dice cuantas ofertas hay pegadas antes de importar',
  /function updateAiFootHint/.test(appJs) && /offres d\\u00e9tect\\u00e9es/.test(appJs));

console.log('\n' + (fail ? fail + ' PRUEBA(S) FALLIDA(S)' : 'Contrato: ninguna prueba falla.'));
process.exit(fail ? 1 : 0);
