/**
 * Backend de "Mi búsqueda de empleo en Estrasburgo".
 *
 * Este script convierte una hoja de Google Sheets en la base de datos de la
 * página web. Se despliega como "Aplicación web" y la URL resultante es la
 * única clave que hay que pegar en la página. No hay nada configurado en el
 * código de la web.
 *
 * Instalación: ver README.md en la raíz del repositorio.
 */

// ---------------------------------------------------------------- esquema

var SCHEMA = {
  Profiles:     ['id', 'name', 'createdAt'],
  JobTypes:     ['id', 'profileId', 'position', 'tipo', 'porQue', 'nivelFrances', 'prioridad'],
  // Las columnas nuevas van SIEMPRE al final: anadirlas en medio desalinearia
  // las filas ya guardadas.
  Applications: ['id', 'profileId', 'jobTypeId', 'position', 'fecha', 'empresa', 'puesto',
                 'fuente', 'estado', 'proximaAccion', 'enlace',
                 'nota', 'misiones', 'sueldo', 'modalidad', 'ventajas',
                 'ubicacion', 'lat', 'lon'],
  Channels:     ['id', 'profileId', 'channelKey', 'name', 'url', 'hecho', 'notas'],

  // Detalle de una candidatura. En Questions, 'answer' es la respuesta que
  // conviene dar si vuelven a hacer la misma pregunta en otra entrevista.
  Questions: ['id', 'profileId', 'applicationId', 'position', 'question', 'answered', 'answer'],
  Learnings: ['id', 'profileId', 'applicationId', 'position', 'note'],
  Contacts:  ['id', 'profileId', 'applicationId', 'position', 'name', 'role', 'email', 'phone']
};

/** Tablas colgadas de una candidatura, para los borrados en cascada. */
var CHILDREN = ['Questions', 'Learnings', 'Contacts'];

// --------------------------------------------------------------- entradas

function doGet(e) {
  return handle((e && e.parameter) || {});
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'El cuerpo de la peticion no es JSON valido' });
  }
  return handle(body);
}

function handle(req) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json({ ok: false, error: 'La hoja esta ocupada, intenta de nuevo' });
  }
  try {
    return json({ ok: true, data: route(req) });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function route(req) {
  var action = req.action;
  var p = req.payload || {};

  switch (action) {
    case 'ping':              return { sheet: SpreadsheetApp.getActiveSpreadsheet().getName() };
    case 'listProfiles':      return { profiles: sortBy(readAll('Profiles'), 'createdAt') };
    case 'createProfile':     return { profile: createProfile(p.name) };
    case 'renameProfile':     return { profile: renameProfile(p.id, p.name) };
    case 'deleteProfile':     return deleteProfile(p.id);
    case 'loadProfile':       return loadProfile(p.profileId || req.profileId);
    case 'upsertJobType':     return { row: upsert('JobTypes', p) };
    case 'deleteJobType':     return deleteJobType(p.id);
    case 'upsertApplication': return { row: upsert('Applications', p) };
    case 'deleteApplication': return deleteApplication(p.id);
    case 'upsertChannel':     return { row: upsert('Channels', p) };
    case 'deleteChannel':     return { removed: remove('Channels', p.id) };

    case 'upsertQuestion':    return { row: upsert('Questions', p) };
    case 'deleteQuestion':    return { removed: remove('Questions', p.id) };
    case 'upsertLearning':    return { row: upsert('Learnings', p) };
    case 'deleteLearning':    return { removed: remove('Learnings', p.id) };
    case 'upsertContact':     return { row: upsert('Contacts', p) };
    case 'deleteContact':     return { removed: remove('Contacts', p.id) };
  }
  throw new Error('Accion desconocida: ' + action);
}

// --------------------------------------------------------------- acciones

function createProfile(name) {
  name = String(name || '').trim();
  if (!name) throw new Error('El perfil necesita un nombre');
  var clash = readAll('Profiles').some(function (r) {
    return String(r.name).trim().toLowerCase() === name.toLowerCase();
  });
  if (clash) throw new Error('Ya existe un perfil con ese nombre');
  return upsert('Profiles', { id: uid(), name: name, createdAt: new Date().toISOString() });
}

function renameProfile(id, name) {
  name = String(name || '').trim();
  if (!name) throw new Error('El perfil necesita un nombre');
  var row = findById('Profiles', id);
  if (!row) throw new Error('Perfil no encontrado');
  row.name = name;
  return upsert('Profiles', row);
}

function deleteProfile(id) {
  ['Applications', 'JobTypes', 'Channels'].concat(CHILDREN).forEach(function (name) {
    removeWhere(name, 'profileId', id);
  });
  return { removed: remove('Profiles', id) };
}

/** Borra un tipo de puesto, sus candidaturas y todo el detalle de estas. */
function deleteJobType(id) {
  readWhere('Applications', 'jobTypeId', id).forEach(function (app) {
    CHILDREN.forEach(function (name) { removeWhere(name, 'applicationId', app.id); });
  });
  removeWhere('Applications', 'jobTypeId', id);
  return { removed: remove('JobTypes', id) };
}

/** Borra una candidatura con sus preguntas, aprendizajes y contactos. */
function deleteApplication(id) {
  CHILDREN.forEach(function (name) { removeWhere(name, 'applicationId', id); });
  return { removed: remove('Applications', id) };
}

function loadProfile(profileId) {
  if (!profileId) throw new Error('Falta el perfil');
  return {
    jobTypes:     sortBy(readWhere('JobTypes', 'profileId', profileId), 'position'),
    applications: sortBy(readWhere('Applications', 'profileId', profileId), 'position'),
    channels:     readWhere('Channels', 'profileId', profileId),
    questions:    sortBy(readWhere('Questions', 'profileId', profileId), 'position'),
    learnings:    sortBy(readWhere('Learnings', 'profileId', profileId), 'position'),
    contacts:     sortBy(readWhere('Contacts', 'profileId', profileId), 'position')
  };
}

// ------------------------------------------------------------ persistencia

/** Devuelve la hoja pedida, creandola con sus cabeceras si hace falta. */
function sheetFor(name) {
  var headers = SCHEMA[name];
  if (!headers) throw new Error('Tabla desconocida: ' + name);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);

  var current = sh.getLastColumn()
    ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String)
    : [];
  // Comparacion elemento a elemento: no depende de ningun separador.
  var same = current.length === headers.length && headers.every(function (h, i) {
    return current[i] === h;
  });
  if (!same) {
    sh.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1B7A6B')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll(name) {
  var headers = SCHEMA[name];
  var sh = sheetFor(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (!String(values[i][0]).trim()) continue; // fila sin id: la ignoramos
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = cell(values[i][c]);
    out.push(obj);
  }
  return out;
}

function readWhere(name, field, value) {
  return readAll(name).filter(function (r) { return r[field] === value; });
}

function findById(name, id) {
  var rows = readAll(name);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

/** Inserta o actualiza por id. Devuelve la fila tal como quedo guardada. */
function upsert(name, obj) {
  var headers = SCHEMA[name];
  var sh = sheetFor(name);
  var row = {};
  headers.forEach(function (h) {
    row[h] = (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
  });
  if (!String(row.id).trim()) row.id = uid();

  var line = headers.map(function (h) { return row[h]; });
  var index = rowIndexOf(sh, row.id);
  if (index > 0) {
    sh.getRange(index, 1, 1, headers.length).setValues([line]);
  } else {
    sh.appendRow(line);
  }
  return row;
}

function remove(name, id) {
  if (!id) return false;
  var sh = sheetFor(name);
  var index = rowIndexOf(sh, id);
  if (index < 0) return false;
  sh.deleteRow(index);
  return true;
}

function removeWhere(name, field, value) {
  var headers = SCHEMA[name];
  var col = headers.indexOf(field);
  if (col < 0) return 0;
  var sh = sheetFor(name);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var removed = 0;
  // De abajo hacia arriba, para que borrar una fila no desplace las siguientes.
  for (var i = values.length - 1; i >= 0; i--) {
    if (cell(values[i][col]) === value) {
      sh.deleteRow(i + 2);
      removed++;
    }
  }
  return removed;
}

function rowIndexOf(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (cell(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

// ---------------------------------------------------------------- helpers

/** Normaliza una celda a texto: Sheets puede devolver Date, number o boolean. */
function cell(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

function sortBy(rows, field) {
  return rows.slice().sort(function (a, b) {
    var x = a[field], y = b[field];
    var nx = Number(x), ny = Number(y);
    if (x !== '' && y !== '' && !isNaN(nx) && !isNaN(ny)) return nx - ny;
    return String(x).localeCompare(String(y));
  });
}

function uid() {
  return Utilities.getUuid();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
