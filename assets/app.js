/* =============================================================
   Mi búsqueda de empleo en Estrasburgo
   Front-end de una sola página. La base de datos es una hoja de
   Google Sheets, a la que se habla a través de una app web de
   Apps Script. La URL de esa app es la única "clave" y la
   introduce la persona que usa la página: no hay nada aquí.
   ============================================================= */
(function () {
  'use strict';

  var LS_URL     = 'estrasburgo.webAppUrl';
  var LS_PROFILE = 'estrasburgo.profileId';
  var SAVE_DELAY = 600;   // ms de espera tras la última tecla
  var RETRY_BASE = 3000;  // ms, se duplica en cada reintento

  // -------------------------------------------------- catálogo de canales
  // Los siete canales del documento original, cada uno con sus enlaces.
  var CHANNELS = [
    {
      key: 'france-travail',
      name: 'France Travail (antes Pôle emploi)',
      why: 'Hay que inscribirse ahí de todas formas.',
      links: [
        { label: 'Inscribirse', url: 'https://candidat.francetravail.fr/inscription/' },
        { label: 'Ofertas en Estrasburgo', url: 'https://candidat.francetravail.fr/offres/recherche?lieux=67482&motsCles=' }
      ]
    },
    {
      key: 'linkedin',
      name: 'LinkedIn',
      why: 'Activar «open to work» con Estrasburgo / Grand Est.',
      links: [
        { label: 'Ofertas en Estrasburgo', url: 'https://www.linkedin.com/jobs/search/?location=Estrasburgo%2C%20Gran%20Este%2C%20Francia' },
        { label: 'Mi perfil', url: 'https://www.linkedin.com/in/' }
      ]
    },
    {
      key: 'portales',
      name: 'Indeed, HelloWork, Welcome to the Jungle',
      why: 'Los portales generalistas: conviene revisarlos con la misma búsqueda guardada.',
      links: [
        { label: 'Indeed', url: 'https://fr.indeed.com/emplois?l=Strasbourg+%2867%29' },
        { label: 'HelloWork', url: 'https://www.hellowork.com/fr-fr/emploi/recherche.html?l=strasbourg-67' },
        { label: 'Welcome to the Jungle', url: 'https://www.welcometothejungle.com/fr/jobs?refinementList%5Boffices.city%5D%5B%5D=Strasbourg' }
      ]
    },
    {
      key: 'apec',
      name: 'APEC',
      why: 'Más para puestos de marketing / comunicación.',
      links: [
        { label: 'Buscar ofertas', url: 'https://www.apec.fr/candidat/recherche-emploi.html/emploi?lieux=59949' }
      ]
    },
    {
      key: 'interim',
      name: 'Agencias de interim',
      why: 'Buenas para conseguir la primera experiencia en Francia rápido.',
      links: [
        { label: 'Manpower', url: 'https://www.manpower.fr/offres-emploi/strasbourg-67000' },
        { label: 'Adecco', url: 'https://www.adecco.fr/offres-emploi/?k=&l=Strasbourg' },
        { label: 'Randstad', url: 'https://www.randstad.fr/offres-emploi/strasbourg/' }
      ]
    },
    {
      key: 'comunidades',
      name: 'Grupos de Facebook y comunidades',
      why: 'Latinos y expatriados en Estrasburgo: mucho boca a boca.',
      links: [
        { label: 'Buscar grupos', url: 'https://www.facebook.com/search/groups/?q=latinos%20Strasbourg' },
        { label: 'Expats Strasbourg', url: 'https://www.facebook.com/search/groups/?q=expats%20Strasbourg' }
      ]
    },
    {
      key: 'empresas',
      name: 'Preguntar directo en las empresas que te gusten',
      why: 'La candidatura espontánea funciona mejor de lo que parece.',
      links: [
        { label: 'Empresas que contratan en Estrasburgo', url: 'https://www.google.com/search?q=entreprises+qui+recrutent+Strasbourg' }
      ]
    }
  ];

  // ------------------------------------------------------ listas cerradas
  var NIVELES = [
    { value: '', label: '—', tone: 'todo' },
    { value: 'No indispensable', label: 'No indispensable', tone: 'good' },
    { value: 'Básico (A1–A2)', label: 'Básico (A1–A2)', tone: 'good' },
    { value: 'Intermedio (B1–B2)', label: 'Intermedio (B1–B2)', tone: 'mid' },
    { value: 'Avanzado (C1–C2)', label: 'Avanzado (C1–C2)', tone: 'high' }
  ];

  var PRIORIDADES = [
    { value: '', label: '—', tone: 'todo' },
    { value: 'Alta', label: 'Alta', tone: 'high' },
    { value: 'Media', label: 'Media', tone: 'mid' },
    { value: 'Baja', label: 'Baja', tone: 'low' }
  ];

  var ESTADOS = [
    { value: '', label: 'Por mandar', tone: 'todo' },
    { value: 'Enviada', label: 'Enviada', tone: 'sent' },
    { value: 'Seguimiento hecho', label: 'Seguimiento hecho', tone: 'sent' },
    { value: 'Respuesta recibida', label: 'Respuesta recibida', tone: 'progress' },
    { value: 'Entrevista', label: 'Entrevista', tone: 'progress' },
    { value: 'Aceptada', label: 'Aceptada', tone: 'good' },
    { value: 'Sin respuesta', label: 'Sin respuesta', tone: 'low' },
    { value: 'Rechazada', label: 'Rechazada', tone: 'bad' }
  ];

  // --------------------------------------------------------------- estado
  var state = {
    url: null,
    profiles: [],
    profileId: null,
    profile: null,
    jobTypes: [],
    applications: [],
    channels: []   // filas guardadas; las del catálogo se buscan por channelKey
  };

  // ---------------------------------------------------------------- utils
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function nextPosition(rows) {
    return rows.reduce(function (max, r) {
      var n = Number(r.position);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0) + 10;
  }

  function toneOf(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i].value === value) return list[i].tone;
    return 'todo';
  }

  // ------------------------------------------------------------------ API

  /**
   * Habla con la app web de Apps Script.
   * Se manda text/plain a propósito: así el navegador no dispara una
   * petición preflight, que Apps Script no sabe responder por sus redirecciones.
   */
  function api(action, payload) {
    if (!state.url) return Promise.reject(new Error('Falta la clave de la hoja'));
    return fetch(state.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    }).then(function (res) {
      if (!res.ok) throw new Error('La hoja respondió ' + res.status);
      return res.text();
    }).then(function (text) {
      var body;
      try {
        body = JSON.parse(text);
      } catch (e) {
        // Normalmente significa que la app web pide iniciar sesión.
        throw new Error('Respuesta inesperada. Revisa que la implementación tenga acceso para «Cualquier usuario».');
      }
      if (!body.ok) throw new Error(body.error || 'Error en la hoja');
      return body.data;
    });
  }

  // ------------------------------------------------------- cola de guardado
  // Cada cambio se encola con una clave. Si se vuelve a tocar el mismo campo
  // antes de que salga, sustituye al anterior: escribir rápido no genera
  // veinte peticiones.
  var queue = new Map();
  var flushTimer = null;
  var flushing = false;
  var retries = 0;

  function enqueue(key, action, payload) {
    // Un borrado invalida cualquier escritura pendiente de la misma fila.
    if (action.indexOf('delete') === 0) {
      var id = payload.id;
      queue.forEach(function (op, k) {
        if (op.payload && op.payload.id === id && k !== key) queue.delete(k);
      });
    }
    queue.set(key, { action: action, payload: payload });
    setSaveState('saving');
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, SAVE_DELAY);
  }

  function flush() {
    if (flushing || !queue.size) return;
    flushing = true;

    var key = queue.keys().next().value;
    var op = queue.get(key);

    api(op.action, op.payload).then(function () {
      // Solo se descarta si nadie la ha reemplazado mientras viajaba:
      // si se siguio escribiendo en el mismo campo, la version nueva se queda.
      if (queue.get(key) === op) queue.delete(key);
      retries = 0;
      flushing = false;
      hideBanner('app-error');
      if (queue.size) flush();
      else setSaveState('saved');
    }).catch(function (err) {
      flushing = false;
      retries++;
      setSaveState('error');
      showBanner('app-error', 'No se pudo guardar: ' + err.message, retryNow);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, Math.min(RETRY_BASE * retries, 20000));
    });
  }

  function retryNow() {
    clearTimeout(flushTimer);
    retries = 0;
    flush();
  }

  function setSaveState(kind) {
    var el = $('save-state');
    if (!el) return;
    var text = { idle: 'Al día', saving: 'Guardando…', saved: 'Guardado', error: 'Sin guardar' }[kind];
    el.setAttribute('data-state', kind);
    $('save-state-text').textContent = text;
    if (kind === 'saved') {
      clearTimeout(setSaveState._t);
      setSaveState._t = setTimeout(function () {
        if (el.getAttribute('data-state') === 'saved' && !queue.size) {
          el.setAttribute('data-state', 'idle');
          $('save-state-text').textContent = 'Al día';
        }
      }, 2500);
    }
  }

  window.addEventListener('beforeunload', function (e) {
    if (queue.size) { e.preventDefault(); e.returnValue = ''; }
  });

  // ------------------------------------------------------------- banners

  function showBanner(id, message, onRetry) {
    var el = $(id);
    if (!el) return;
    el.innerHTML = '<span>' + esc(message) + '</span>';
    if (onRetry) {
      var b = document.createElement('button');
      b.className = 'btn btn--sm';
      b.type = 'button';
      b.textContent = 'Reintentar';
      b.addEventListener('click', onRetry);
      el.appendChild(b);
    }
    el.hidden = false;
  }

  function hideBanner(id) {
    var el = $(id);
    if (el) el.hidden = true;
  }

  // --------------------------------------------------------------- vistas

  function show(name, loadingText) {
    ['view-connect', 'view-profiles', 'view-app', 'view-loading'].forEach(function (v) {
      $(v).hidden = (v !== 'view-' + name);
    });
    if (name === 'loading' && loadingText) $('loading-text').textContent = loadingText;
    window.scrollTo(0, 0);
  }

  // =====================================================================
  //  Conexión
  // =====================================================================

  $('connect-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var url = $('connect-url').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(url)) {
      showBanner('connect-error', 'Esa no parece la URL de la app web. Tiene que empezar por https://script.google.com/macros/s/ y acabar en /exec.');
      return;
    }
    hideBanner('connect-error');
    $('connect-submit').disabled = true;
    $('connect-submit').textContent = 'Comprobando…';

    state.url = url;
    api('ping').then(function () {
      localStorage.setItem(LS_URL, url);
      return openProfiles();
    }).catch(function (err) {
      state.url = null;
      showBanner('connect-error', 'No se pudo conectar: ' + err.message);
      show('connect');
    }).then(function () {
      $('connect-submit').disabled = false;
      $('connect-submit').textContent = 'Conectar con mi hoja';
    });
  });

  function changeKey() {
    if (queue.size && !confirm('Hay cambios sin guardar. ¿Cambiar la clave de todas formas?')) return;
    queue.clear();
    localStorage.removeItem(LS_URL);
    localStorage.removeItem(LS_PROFILE);
    state.url = null;
    state.profileId = null;
    $('connect-url').value = '';
    hideBanner('connect-error');
    show('connect');
  }

  $('btn-change-key').addEventListener('click', changeKey);
  $('btn-change-key-app').addEventListener('click', changeKey);

  // =====================================================================
  //  Perfiles
  // =====================================================================

  function openProfiles() {
    show('loading', 'Buscando perfiles…');
    return api('listProfiles').then(function (data) {
      state.profiles = data.profiles || [];
      renderProfiles();
      hideBanner('profiles-error');
      show('profiles');
    }).catch(function (err) {
      showBanner('profiles-error', 'No se pudieron cargar los perfiles: ' + err.message);
      renderProfiles();
      show('profiles');
    });
  }

  function renderProfiles() {
    var box = $('profile-list');
    if (!state.profiles.length) {
      box.innerHTML = '<p class="empty">Todavía no hay ningún perfil. Crea el primero abajo.</p>';
      return;
    }
    box.innerHTML = state.profiles.map(function (p) {
      return '<button class="profile-card" type="button" data-id="' + esc(p.id) + '">' +
             '<span class="avatar" aria-hidden="true">' + esc(initials(p.name)) + '</span>' +
             '<span>' + esc(p.name) + '</span>' +
             '<span class="go" aria-hidden="true">→</span></button>';
    }).join('');
  }

  $('profile-list').addEventListener('click', function (e) {
    var card = e.target.closest('.profile-card');
    if (card) openProfile(card.getAttribute('data-id'));
  });

  $('new-profile-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('new-profile-name');
    var name = input.value.trim();
    if (!name) return;

    show('loading', 'Creando el perfil…');
    api('createProfile', { name: name }).then(function (data) {
      input.value = '';
      state.profiles.push(data.profile);
      return seedJobTypes(data.profile.id).then(function () {
        return openProfile(data.profile.id);
      });
    }).catch(function (err) {
      showBanner('profiles-error', 'No se pudo crear el perfil: ' + err.message);
      show('profiles');
    });
  });

  /** Un perfil nuevo arranca con tres tipos de puesto vacíos, como el documento. */
  function seedJobTypes(profileId) {
    var rows = [0, 1, 2].map(function (i) {
      return {
        id: uid(), profileId: profileId, position: (i + 1) * 10,
        tipo: '', porQue: '', nivelFrances: '', prioridad: ''
      };
    });
    return rows.reduce(function (chain, row) {
      return chain.then(function () { return api('upsertJobType', row); });
    }, Promise.resolve());
  }

  $('btn-reload-profiles').addEventListener('click', openProfiles);
  $('btn-switch-profile').addEventListener('click', function () {
    // Lo que queda en la cola lleva su propio profileId, asi que se guarda en
    // el perfil correcto aunque ya estemos en otro. Solo avisamos.
    if (queue.size && !confirm('Quedan cambios por enviar. Se guardaran en el perfil de ' +
        state.profile.name + ' de todas formas. ¿Cambiar de perfil ahora?')) return;
    localStorage.removeItem(LS_PROFILE);
    state.profileId = null;
    openProfiles();
  });

  function openProfile(id) {
    show('loading', 'Abriendo tu documento…');
    state.profileId = id;
    return api('loadProfile', { profileId: id }).then(function (data) {
      state.profile = state.profiles.filter(function (p) { return p.id === id; })[0] || { id: id, name: '?' };
      state.jobTypes = data.jobTypes || [];
      state.applications = data.applications || [];
      state.channels = data.channels || [];
      localStorage.setItem(LS_PROFILE, id);
      renderApp();
      hideBanner('app-error');
      setSaveState('idle');
      show('app');
    }).catch(function (err) {
      showBanner('profiles-error', 'No se pudo abrir el perfil: ' + err.message);
      show('profiles');
    });
  }

  $('btn-reload-app').addEventListener('click', function () {
    if (queue.size && !confirm('Hay cambios sin guardar. ¿Recargar de todas formas?')) return;
    queue.clear();
    openProfile(state.profileId);
  });

  // =====================================================================
  //  Documento
  // =====================================================================

  function renderApp() {
    $('profile-name').textContent = state.profile.name;
    $('profile-avatar').textContent = initials(state.profile.name);
    renderChannels();
    renderJobTypes();
    renderTracking();
  }

  // ------------------------------------------------------- 1. canales

  /** Devuelve (creándola si hace falta) la fila guardada de un canal. */
  function channelRow(key) {
    var found = state.channels.filter(function (c) { return c.channelKey === key; })[0];
    if (found) return found;
    // El id se deriva del perfil y del canal, no es aleatorio: si el mismo
    // perfil esta abierto en dos dispositivos, los dos escriben en la misma
    // fila en vez de crear duplicados.
    var row = {
      id: channelId(key), profileId: state.profileId, channelKey: key,
      name: '', url: '', hecho: '', notas: ''
    };
    state.channels.push(row);
    return row;
  }

  function channelId(key) {
    return state.profileId + '::' + key;
  }

  function renderChannels() {
    var custom = state.channels.filter(function (c) {
      return !CHANNELS.some(function (d) { return d.key === c.channelKey; });
    });

    var html = CHANNELS.map(function (def) {
      var row = state.channels.filter(function (c) { return c.channelKey === def.key; })[0] || {};
      var links = def.links.map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
      }).join(' · ');
      return channelHtml(def.key, esc(def.name), links, esc(def.why), row.hecho === 'si', row.notas || '', false);
    }).join('');

    html += custom.map(function (row) {
      var links = row.url
        ? '<a href="' + esc(row.url) + '" target="_blank" rel="noopener">Abrir</a>'
        : '';
      var name = '<input class="cell-input" style="padding:0;font-weight:600" data-ckey="' + esc(row.channelKey) +
                 '" data-cfield="name" value="' + esc(row.name) + '" placeholder="Nombre del canal">';
      return channelHtml(row.channelKey, name, links, '', row.hecho === 'si', row.notas || '', true, row.url);
    }).join('');

    $('channels').innerHTML = html;

    var done = state.channels.filter(function (c) { return c.hecho === 'si'; }).length;
    var total = CHANNELS.length + custom.length;
    $('channels-count').textContent = done + ' de ' + total + ' listos';
  }

  function channelHtml(key, nameHtml, linksHtml, why, done, notas, isCustom, url) {
    return '<div class="channel' + (done ? ' is-done' : '') + '" data-ckey="' + esc(key) + '">' +
      '<input class="channel-check" type="checkbox" data-cfield="hecho"' + (done ? ' checked' : '') +
        ' aria-label="Marcar canal como listo">' +
      '<div class="channel-main">' +
        '<div class="channel-name">' + nameHtml + (linksHtml ? ' <span style="font-weight:400;font-size:13.5px">' + linksHtml + '</span>' : '') + '</div>' +
        (why ? '<div class="channel-why">' + why + '</div>' :
          (isCustom ? '<input class="channel-note" style="margin-top:5px" data-cfield="url" value="' + esc(url || '') + '" placeholder="https://… (opcional)">' : '')) +
      '</div>' +
      '<input class="channel-note" data-cfield="notas" value="' + esc(notas) + '" placeholder="Notas: usuario, fecha de inscripción, contacto…">' +
      (isCustom ? '<button class="row-del" type="button" data-cdel="1" aria-label="Quitar canal">×</button>'
                : '<span></span>') +
      '</div>';
  }

  $('channels').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-cfield');
    if (!field || e.target.type === 'checkbox') return;
    var key = e.target.closest('.channel').getAttribute('data-ckey');
    var row = channelRow(key);
    row[field] = e.target.value;
    enqueue('channel:' + row.id, 'upsertChannel', row);
  });

  $('channels').addEventListener('change', function (e) {
    if (e.target.getAttribute('data-cfield') !== 'hecho') return;
    var wrap = e.target.closest('.channel');
    var row = channelRow(wrap.getAttribute('data-ckey'));
    row.hecho = e.target.checked ? 'si' : '';
    wrap.classList.toggle('is-done', e.target.checked);
    enqueue('channel:' + row.id, 'upsertChannel', row);

    var custom = state.channels.filter(function (c) {
      return !CHANNELS.some(function (d) { return d.key === c.channelKey; });
    }).length;
    var done = state.channels.filter(function (c) { return c.hecho === 'si'; }).length;
    $('channels-count').textContent = done + ' de ' + (CHANNELS.length + custom) + ' listos';
  });

  $('channels').addEventListener('click', function (e) {
    if (!e.target.getAttribute('data-cdel')) return;
    var key = e.target.closest('.channel').getAttribute('data-ckey');
    var row = state.channels.filter(function (c) { return c.channelKey === key; })[0];
    if (!row) return;
    state.channels = state.channels.filter(function (c) { return c !== row; });
    enqueue('channel-del:' + row.id, 'deleteChannel', { id: row.id });
    renderChannels();
  });

  $('btn-add-channel').addEventListener('click', function () {
    var key = uid();
    var row = {
      id: channelId(key), profileId: state.profileId, channelKey: key,
      name: '', url: '', hecho: '', notas: ''
    };
    state.channels.push(row);
    enqueue('channel:' + row.id, 'upsertChannel', row);
    renderChannels();
    var inputs = $('channels').querySelectorAll('[data-cfield="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // -------------------------------------------------- 2. tipos de puesto

  function selectHtml(list, value, field, id) {
    var options = list.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' +
             esc(o.label) + '</option>';
    }).join('');
    return '<select class="cell-select" data-id="' + esc(id) + '" data-field="' + field +
           '" data-tone="' + toneOf(list, value) + '">' + options + '</select>';
  }

  function renderJobTypes() {
    var body = $('jobtypes-body');
    if (!state.jobTypes.length) {
      body.innerHTML = '<tr><td colspan="5" data-label=""><p class="empty" style="margin:10px">' +
        'Añade el primer tipo de puesto que te interese.</p></td></tr>';
    } else {
      body.innerHTML = state.jobTypes.map(function (r, i) {
        return '<tr data-id="' + esc(r.id) + '">' +
          '<td data-label="Tipo de puesto"><input class="cell-input" data-field="tipo" value="' + esc(r.tipo) +
            '" placeholder="Tipo de puesto ' + (i + 1) + '"></td>' +
          '<td data-label="¿Por qué me interesa?"><textarea class="cell-input" data-field="porQue" rows="1" ' +
            'placeholder="Lo que te atrae de este tipo de trabajo">' + esc(r.porQue) + '</textarea></td>' +
          '<td data-label="Nivel de francés">' + selectHtml(NIVELES, r.nivelFrances, 'nivelFrances', r.id) + '</td>' +
          '<td data-label="Prioridad">' + selectHtml(PRIORIDADES, r.prioridad, 'prioridad', r.id) + '</td>' +
          '<td class="cell-actions"><button class="row-del" type="button" data-del="1" ' +
            'aria-label="Quitar tipo de puesto">×</button></td>' +
        '</tr>';
      }).join('');
    }
    $('jobtypes-hint').textContent = state.jobTypes.length
      ? 'Cada tipo de puesto tiene su propia tabla de seguimiento abajo.'
      : '';
    autoGrowAll(body);
  }

  function jobTypeById(id) {
    return state.jobTypes.filter(function (r) { return r.id === id; })[0];
  }

  $('jobtypes-body').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field) return;
    var tr = e.target.closest('tr');
    var row = jobTypeById(tr.getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    // El nombre del tipo titula su tabla de seguimiento: se actualiza en vivo.
    if (field === 'tipo') updateTrackingTitle(row);
    enqueue('jobtype:' + row.id, 'upsertJobType', row);
  });

  $('jobtypes-body').addEventListener('change', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field || e.target.tagName !== 'SELECT') return;
    var row = jobTypeById(e.target.getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    e.target.setAttribute('data-tone', toneOf(field === 'prioridad' ? PRIORIDADES : NIVELES, e.target.value));
    enqueue('jobtype:' + row.id, 'upsertJobType', row);
  });

  $('jobtypes-body').addEventListener('click', function (e) {
    if (!e.target.getAttribute('data-del')) return;
    var id = e.target.closest('tr').getAttribute('data-id');
    var row = jobTypeById(id);
    if (!row) return;
    var mine = state.applications.filter(function (a) { return a.jobTypeId === id; }).length;
    var msg = mine
      ? '¿Quitar «' + (row.tipo || 'este tipo de puesto') + '» y sus ' + mine + ' candidatura(s)?'
      : '¿Quitar esta fila?';
    if (!confirm(msg)) return;

    state.jobTypes = state.jobTypes.filter(function (r) { return r.id !== id; });
    state.applications = state.applications.filter(function (a) { return a.jobTypeId !== id; });
    enqueue('jobtype-del:' + id, 'deleteJobType', { id: id });
    renderJobTypes();
    renderTracking();
  });

  $('btn-add-jobtype').addEventListener('click', function () {
    var row = {
      id: uid(), profileId: state.profileId, position: nextPosition(state.jobTypes),
      tipo: '', porQue: '', nivelFrances: '', prioridad: ''
    };
    state.jobTypes.push(row);
    enqueue('jobtype:' + row.id, 'upsertJobType', row);
    renderJobTypes();
    renderTracking();
    var rows = $('jobtypes-body').querySelectorAll('[data-field="tipo"]');
    if (rows.length) rows[rows.length - 1].focus();
  });

  // ---------------------------------------------------- 3. seguimiento

  function jobTypeLabel(row, index) {
    return (row.tipo && row.tipo.trim()) || 'Tipo de puesto ' + (index + 1);
  }

  function renderTracking() {
    var box = $('tracking');

    if (!state.jobTypes.length) {
      box.innerHTML = '<p class="empty">Añade arriba un tipo de puesto y aquí aparecerá su tabla de seguimiento.</p>';
      renderStats();
      return;
    }

    box.innerHTML = state.jobTypes.map(function (jt, i) {
      var rows = state.applications.filter(function (a) { return a.jobTypeId === jt.id; });
      return '<section data-jt="' + esc(jt.id) + '">' +
        '<h3 class="subsection"><span data-jt-title>' + esc(jobTypeLabel(jt, i)) + '</span>' +
          '<span class="count-hint" data-jt-count>' + countLabel(rows) + '</span></h3>' +
        '<div class="table-wrap"><table class="grid">' +
          '<thead><tr>' +
            '<th style="width:12%">Fecha</th>' +
            '<th style="width:18%">Empresa</th>' +
            '<th style="width:22%">Puesto exacto</th>' +
            '<th style="width:15%">Fuente / canal</th>' +
            '<th style="width:15%">Estado</th>' +
            '<th style="width:18%">Próxima acción</th>' +
            '<th style="width:44px"><span class="sr-only">Acciones</span></th>' +
          '</tr></thead>' +
          '<tbody>' + (rows.length ? rows.map(applicationHtml).join('')
            : '<tr><td colspan="7" data-label=""><p class="empty" style="margin:10px">Sin candidaturas todavía.</p></td></tr>') +
          '</tbody>' +
        '</table></div>' +
        '<div class="table-foot"><button class="btn btn--sm" type="button" data-add-app="' + esc(jt.id) + '">' +
          '+ Añadir candidatura</button></div>' +
      '</section>';
    }).join('');

    renderStats();
    autoGrowAll(box);
  }

  function applicationHtml(a) {
    var fuentes = ['<option value=""></option>'].concat(CHANNELS.map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (c.name === a.fuente ? ' selected' : '') + '>' +
             esc(c.name.length > 34 ? c.name.slice(0, 32) + '…' : c.name) + '</option>';
    }));
    // Una fuente escrita a mano (o un canal propio) tiene que seguir apareciendo.
    if (a.fuente && a.fuente !== 'Otro' && !CHANNELS.some(function (c) { return c.name === a.fuente; })) {
      fuentes.push('<option value="' + esc(a.fuente) + '" selected>' + esc(a.fuente) + '</option>');
    }
    fuentes.push('<option value="Otro">Otro / contacto directo</option>');

    return '<tr data-id="' + esc(a.id) + '">' +
      '<td data-label="Fecha"><input class="cell-input" type="date" data-field="fecha" value="' + esc(a.fecha) + '"></td>' +
      '<td data-label="Empresa"><input class="cell-input" data-field="empresa" value="' + esc(a.empresa) + '" placeholder="Empresa"></td>' +
      '<td data-label="Puesto exacto">' +
        '<input class="cell-input" data-field="puesto" value="' + esc(a.puesto) + '" placeholder="Título de la oferta">' +
        '<div class="cell-sub">' +
          '<input class="cell-sub-input" data-field="enlace" value="' + esc(a.enlace) +
            '" placeholder="Enlace a la oferta (opcional)" inputmode="url" spellcheck="false">' +
          linkOutHtml(a.enlace) +
        '</div>' +
      '</td>' +
      '<td data-label="Fuente / canal"><select class="cell-select" data-field="fuente">' + fuentes.join('') + '</select></td>' +
      '<td data-label="Estado">' + selectHtml(ESTADOS, a.estado, 'estado', a.id) + '</td>' +
      '<td data-label="Próxima acción"><input class="cell-input" data-field="proximaAccion" value="' + esc(a.proximaAccion) +
        '" placeholder="Ej.: escribir en 10 días"></td>' +
      '<td class="cell-actions"><button class="row-del" type="button" data-del="1" aria-label="Quitar candidatura">×</button></td>' +
    '</tr>';
  }

  /** La flechita para abrir la oferta. Solo aparece si hay algo escrito. */
  function linkOutHtml(value) {
    if (!String(value || '').trim()) return '<span class="link-out" data-link-out hidden></span>';
    return '<a class="link-out" data-link-out href="' + esc(normalizeUrl(value)) +
           '" target="_blank" rel="noopener" title="Abrir la oferta">↗</a>';
  }

  /** Acepta que se pegue «empresa.fr/oferta» sin el https:// delante. */
  function normalizeUrl(value) {
    var v = String(value || '').trim();
    if (!v) return '';
    // Solo http(s): cualquier otra cosa se trata como dominio y se le pone
    // https:// delante, para que no pueda colarse un javascript: en el href.
    return /^https?:\/\//i.test(v) ? v : 'https://' + v;
  }

  function countLabel(rows) {
    if (!rows.length) return '';
    var sent = rows.filter(function (r) { return r.estado && r.estado !== 'Por mandar'; }).length;
    return rows.length + (rows.length === 1 ? ' candidatura' : ' candidaturas') +
           (sent ? ' · ' + sent + ' en marcha' : '');
  }

  function appById(id) {
    return state.applications.filter(function (a) { return a.id === id; })[0];
  }

  $('tracking').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field) return;
    var row = appById(e.target.closest('tr').getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    if (field === 'enlace') refreshLinkOut(e.target);
    enqueue('app:' + row.id, 'upsertApplication', row);
  });

  $('tracking').addEventListener('change', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field || e.target.tagName !== 'SELECT') return;
    var tr = e.target.closest('tr');
    var row = appById(tr.getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    if (field === 'estado') {
      e.target.setAttribute('data-tone', toneOf(ESTADOS, e.target.value));
      refreshCounts(tr.closest('section[data-jt]'));
      renderStats();
    }
    enqueue('app:' + row.id, 'upsertApplication', row);
  });

  $('tracking').addEventListener('click', function (e) {
    var addFor = e.target.getAttribute('data-add-app');
    if (addFor) return addApplication(addFor);

    if (!e.target.getAttribute('data-del')) return;
    var tr = e.target.closest('tr');
    var id = tr.getAttribute('data-id');
    var row = appById(id);
    if (!row) return;
    if ((row.empresa || row.puesto) && !confirm('¿Quitar la candidatura de «' + (row.empresa || row.puesto) + '»?')) return;
    state.applications = state.applications.filter(function (a) { return a.id !== id; });
    enqueue('app-del:' + id, 'deleteApplication', { id: id });
    renderTracking();
  });

  function addApplication(jobTypeId) {
    var mine = state.applications.filter(function (a) { return a.jobTypeId === jobTypeId; });
    var row = {
      id: uid(), profileId: state.profileId, jobTypeId: jobTypeId,
      position: nextPosition(mine),
      fecha: today(), empresa: '', puesto: '', fuente: '', estado: '', proximaAccion: '', enlace: ''
    };
    state.applications.push(row);
    enqueue('app:' + row.id, 'upsertApplication', row);
    renderTracking();
    var section = $('tracking').querySelector('section[data-jt="' + cssEsc(jobTypeId) + '"]');
    if (section) {
      var inputs = section.querySelectorAll('[data-field="empresa"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  }

  function updateTrackingTitle(jobTypeRow) {
    var index = state.jobTypes.indexOf(jobTypeRow);
    var section = $('tracking').querySelector('section[data-jt="' + cssEsc(jobTypeRow.id) + '"]');
    if (!section) return;
    var title = section.querySelector('[data-jt-title]');
    if (title) title.textContent = jobTypeLabel(jobTypeRow, index);
  }

  function refreshLinkOut(input) {
    var box = input.closest('.cell-sub');
    if (!box) return;
    var old = box.querySelector('[data-link-out]');
    var fresh = document.createElement('div');
    fresh.innerHTML = linkOutHtml(input.value);
    if (old) box.replaceChild(fresh.firstChild, old);
  }

  function refreshCounts(section) {
    if (!section) return;
    var id = section.getAttribute('data-jt');
    var el = section.querySelector('[data-jt-count]');
    if (el) el.textContent = countLabel(state.applications.filter(function (a) { return a.jobTypeId === id; }));
  }

  function renderStats() {
    var all = state.applications;
    var enviadas = all.filter(function (a) {
      return ['Enviada', 'Seguimiento hecho', 'Respuesta recibida', 'Entrevista', 'Aceptada', 'Sin respuesta', 'Rechazada'].indexOf(a.estado) >= 0;
    }).length;
    var entrevistas = all.filter(function (a) { return a.estado === 'Entrevista' || a.estado === 'Aceptada'; }).length;
    var pendientes = all.filter(function (a) { return !a.estado; }).length;

    var cards = [
      { value: all.length, label: all.length === 1 ? 'candidatura' : 'candidaturas' },
      { value: enviadas, label: 'ya enviadas' },
      { value: entrevistas, label: entrevistas === 1 ? 'entrevista' : 'entrevistas' },
      { value: pendientes, label: 'por mandar' }
    ];

    $('stats').innerHTML = all.length ? cards.map(function (c) {
      return '<div class="stat"><div class="stat-value">' + c.value + '</div>' +
             '<div class="stat-label">' + esc(c.label) + '</div></div>';
    }).join('') : '';
  }

  // ---------------------------------------------------------- pequeñeces

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 22) + 'px';
  }
  function autoGrowAll(root) {
    Array.prototype.forEach.call(root.querySelectorAll('textarea'), autoGrow);
  }

  // =====================================================================
  //  Arranque
  // =====================================================================

  (function boot() {
    var url = localStorage.getItem(LS_URL);
    if (!url) return show('connect');

    state.url = url;
    var wanted = localStorage.getItem(LS_PROFILE);
    show('loading', 'Conectando con la hoja…');

    api('listProfiles').then(function (data) {
      state.profiles = data.profiles || [];
      var exists = wanted && state.profiles.some(function (p) { return p.id === wanted; });
      if (exists) return openProfile(wanted);
      renderProfiles();
      show('profiles');
    }).catch(function (err) {
      showBanner('connect-error', 'No se pudo conectar con la hoja: ' + err.message +
        ' Comprueba la clave o vuelve a pegarla.');
      $('connect-url').value = url;
      show('connect');
    });
  })();

})();
