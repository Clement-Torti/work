/* =============================================================
   Ma recherche d'emploi a Strasbourg
   Front-end de una sola pagina. La base de datos es una hoja de
   Google Sheets, a la que se habla a traves de una app web de
   Apps Script. La URL de esa app es la unica "clave" y la
   introduce la persona que usa la pagina: no hay nada aqui.

   La interfaz esta en frances. Los nombres de campo internos y
   los comentarios se quedan como estan: renombrar las columnas
   romperia las filas ya guardadas en la hoja.
   ============================================================= */
(function () {
  'use strict';

  var LS_URL     = 'estrasburgo.webAppUrl';
  var LS_PROFILE = 'estrasburgo.profileId';
  var SAVE_DELAY = 600;   // ms de espera tras la ultima tecla
  var RETRY_BASE = 3000;  // ms, crece en cada reintento

  var STRASBOURG = [48.5734, 7.7521];

  // -------------------------------------------------- catalogo de canales
  var CHANNELS = [
    {
      key: 'france-travail',
      name: 'France Travail',
      why: 'Il faut s\u2019y inscrire de toute fa\u00e7on.',
      links: [
        { label: 'Inscription', url: 'https://candidat.francetravail.fr/inscription/' },
        { label: 'Offres', url: 'https://candidat.francetravail.fr/offres/recherche?lieux=67482&motsCles=' }
      ]
    },
    {
      key: 'linkedin',
      name: 'LinkedIn',
      why: 'Activer \u00ab open to work \u00bb sur Strasbourg / Grand Est.',
      links: [
        { label: 'Offres', url: 'https://www.linkedin.com/jobs/search/?location=Strasbourg%2C%20Grand%20Est%2C%20France' },
        { label: 'Mon profil', url: 'https://www.linkedin.com/in/' }
      ]
    },
    {
      key: 'portails',
      name: 'Portails g\u00e9n\u00e9ralistes',
      why: 'Indeed, HelloWork et Welcome to the Jungle : la m\u00eame recherche enregistr\u00e9e sur les trois.',
      links: [
        { label: 'Indeed', url: 'https://fr.indeed.com/emplois?l=Strasbourg+%2867%29' },
        { label: 'HelloWork', url: 'https://www.hellowork.com/fr-fr/emploi/recherche.html?l=strasbourg-67' },
        { label: 'Welcome to the Jungle', url: 'https://www.welcometothejungle.com/fr/jobs?refinementList%5Boffices.city%5D%5B%5D=Strasbourg' }
      ]
    },
    {
      key: 'apec',
      name: 'APEC',
      why: 'Plut\u00f4t pour les postes marketing / communication.',
      links: [
        { label: 'Offres', url: 'https://www.apec.fr/candidat/recherche-emploi.html/emploi?lieux=59949' }
      ]
    },
    {
      key: 'interim',
      name: 'Agences d\u2019int\u00e9rim',
      why: 'Bien pour d\u00e9crocher vite une premi\u00e8re exp\u00e9rience en France.',
      links: [
        { label: 'Manpower', url: 'https://www.manpower.fr/offres-emploi/strasbourg-67000' },
        { label: 'Adecco', url: 'https://www.adecco.fr/offres-emploi/?k=&l=Strasbourg' },
        { label: 'Randstad', url: 'https://www.randstad.fr/offres-emploi/strasbourg/' }
      ]
    },
    {
      key: 'communautes',
      name: 'Groupes Facebook et communaut\u00e9s',
      why: 'Latinos et expatri\u00e9s \u00e0 Strasbourg : beaucoup de bouche-\u00e0-oreille.',
      links: [
        { label: 'Latinos', url: 'https://www.facebook.com/search/groups/?q=latinos%20Strasbourg' },
        { label: 'Expats', url: 'https://www.facebook.com/search/groups/?q=expats%20Strasbourg' }
      ]
    },
    {
      key: 'spontanee',
      name: 'Candidature spontan\u00e9e',
      why: 'Demander directement aux entreprises qui te plaisent. \u00c7a marche mieux qu\u2019on ne croit.',
      links: [
        { label: 'Qui recrute \u00e0 Strasbourg', url: 'https://www.google.com/search?q=entreprises+qui+recrutent+Strasbourg' }
      ]
    }
  ];

  // ------------------------------------------------------ listas cerradas
  var NIVEAUX = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Pas indispensable', label: 'Pas indispensable', tone: 'good' },
    { value: 'Basique (A1-A2)', label: 'Basique (A1-A2)', tone: 'good' },
    { value: 'Interm\u00e9diaire (B1-B2)', label: 'Interm\u00e9diaire (B1-B2)', tone: 'mid' },
    { value: 'Avanc\u00e9 (C1-C2)', label: 'Avanc\u00e9 (C1-C2)', tone: 'high' }
  ];

  var PRIORITES = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Haute', label: 'Haute', tone: 'high' },
    { value: 'Moyenne', label: 'Moyenne', tone: 'mid' },
    { value: 'Basse', label: 'Basse', tone: 'low' }
  ];

  var STATUTS = [
    { value: '', label: '\u00c0 envoyer', tone: 'todo' },
    { value: 'Envoy\u00e9e', label: 'Envoy\u00e9e', tone: 'sent' },
    { value: 'Relance faite', label: 'Relance faite', tone: 'sent' },
    { value: 'R\u00e9ponse re\u00e7ue', label: 'R\u00e9ponse re\u00e7ue', tone: 'progress' },
    { value: 'Entretien', label: 'Entretien', tone: 'progress' },
    { value: 'Accept\u00e9e', label: 'Accept\u00e9e', tone: 'good' },
    { value: 'Sans r\u00e9ponse', label: 'Sans r\u00e9ponse', tone: 'low' },
    { value: 'Refus\u00e9e', label: 'Refus\u00e9e', tone: 'bad' }
  ];

  /** Estados que cuentan como "ya enviada". */
  var STATUTS_ENVOYES = ['Envoy\u00e9e', 'Relance faite', 'R\u00e9ponse re\u00e7ue', 'Entretien',
                         'Accept\u00e9e', 'Sans r\u00e9ponse', 'Refus\u00e9e'];

  var MODALITES = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Pr\u00e9sentiel', label: 'Pr\u00e9sentiel', tone: 'mid' },
    { value: 'Hybride', label: 'Hybride', tone: 'good' },
    { value: 'T\u00e9l\u00e9travail', label: 'T\u00e9l\u00e9travail', tone: 'good' }
  ];

  var REPONDU = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'oui', label: 'Oui', tone: 'good' },
    { value: 'moiti\u00e9', label: '\u00c0 moiti\u00e9', tone: 'mid' },
    { value: 'non', label: 'Non', tone: 'bad' }
  ];

  /** Nota sobre 10. El tono le da el color a la celda. */
  var NOTES = (function () {
    var out = [{ value: '', label: '\u2014', tone: 'todo' }];
    for (var i = 10; i >= 0; i--) {
      out.push({ value: String(i), label: i + '/10', tone: i >= 7 ? 'good' : (i >= 5 ? 'mid' : 'bad') });
    }
    return out;
  })();

  // --------------------------------------------------------------- estado
  var state = {
    url: null,
    profiles: [],
    profileId: null,
    profile: null,
    jobTypes: [],
    applications: [],
    channels: [],
    companies: [],
    questions: [],
    learnings: [],
    contacts: []
  };

  var openAppId = null;   // candidatura abierta en la ficha
  var map = null;         // Leaflet de la ficha, solo mientras esta abierta
  var marker = null;

  var coMap = null;       // Leaflet de la seccion Entreprises, permanente
  var coMarkers = {};     // id de empresa -> marcador
  var coFitKey = '';      // para no recentrar el mapa en cada tecleo
  var coHl = null;        // empresa resaltada al pasar por su fila

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

  function byId(rows, id) {
    return rows.filter(function (r) { return r.id === id; })[0];
  }

  function forApp(rows, appId) {
    return rows.filter(function (r) { return r.applicationId === appId; });
  }

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

  /** Acepta que se pegue "entreprise.fr/offre" sin el https:// delante. */
  function normalizeUrl(value) {
    var v = String(value || '').trim();
    if (!v) return '';
    // Solo http(s): asi no puede colarse un javascript: en el href.
    return /^https?:\/\//i.test(v) ? v : 'https://' + v;
  }

  // ------------------------------------------------------------------ API

  var ACCESS_HINT = 'Google bloque l\u2019acc\u00e8s \u00e0 la feuille. En g\u00e9n\u00e9ral, c\u2019est que le ' +
    'd\u00e9ploiement n\u2019est pas publi\u00e9 pour \u00ab Tout le monde \u00bb : dans Apps Script, ' +
    'D\u00e9ployer \u2192 G\u00e9rer les d\u00e9ploiements \u2192 crayon \u2192 \u00ab Qui a acc\u00e8s : ' +
    'Tout le monde \u00bb \u2192 D\u00e9ployer.';

  /**
   * Habla con la app web de Apps Script.
   * Se manda text/plain a proposito: asi el navegador no dispara una
   * peticion preflight, que Apps Script no sabe responder por sus redirecciones.
   */
  function api(action, payload) {
    if (!state.url) return Promise.reject(new Error('Cl\u00e9 de la feuille manquante'));
    return fetch(state.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    }).catch(function (err) {
      // Un fetch que ni siquiera llega a responder casi siempre es esto: Google
      // devuelve su pagina de "acceso denegado", que no lleva cabeceras CORS,
      // y el navegador la bloquea antes de que podamos leer el codigo de estado.
      throw new Error(ACCESS_HINT + ' (d\u00e9tail technique : ' + err.message + ')');
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error(ACCESS_HINT);
      if (!res.ok) throw new Error('La feuille a r\u00e9pondu ' + res.status + '. R\u00e9essaie dans un instant.');
      return res.text();
    }).then(function (text) {
      var body;
      try {
        body = JSON.parse(text);
      } catch (e) {
        throw new Error(ACCESS_HINT);
      }
      if (!body.ok) throw new Error(body.error || 'Erreur dans la feuille');
      return body.data;
    });
  }

  // ------------------------------------------------------- cola de guardado
  // Cada cambio se encola con una clave. Si se vuelve a tocar el mismo campo
  // antes de que salga, sustituye al anterior: escribir rapido no genera
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
      // Solo se descarta si nadie la ha reemplazado mientras viajaba.
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
      showBanner('app-error', 'Impossible d\u2019enregistrer : ' + err.message, retryNow);
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
    var text = {
      idle: '\u00c0 jour', saving: 'Enregistrement\u2026',
      saved: 'Enregistr\u00e9', error: 'Non enregistr\u00e9'
    }[kind];
    el.setAttribute('data-state', kind);
    $('save-state-text').textContent = text;
    if (kind === 'saved') {
      clearTimeout(setSaveState._t);
      setSaveState._t = setTimeout(function () {
        if (el.getAttribute('data-state') === 'saved' && !queue.size) {
          el.setAttribute('data-state', 'idle');
          $('save-state-text').textContent = '\u00c0 jour';
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
      b.textContent = 'R\u00e9essayer';
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
  //  Connexion
  // =====================================================================

  $('connect-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var url = $('connect-url').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(url)) {
      showBanner('connect-error', 'Ce n\u2019est pas l\u2019URL de l\u2019application web. Elle doit commencer ' +
        'par https://script.google.com/macros/s/ et finir par /exec.');
      return;
    }
    hideBanner('connect-error');
    $('connect-submit').disabled = true;
    $('connect-submit').textContent = 'V\u00e9rification\u2026';

    state.url = url;
    api('ping').then(function () {
      localStorage.setItem(LS_URL, url);
      return openProfiles();
    }).catch(function (err) {
      state.url = null;
      showBanner('connect-error', 'Connexion impossible : ' + err.message);
      show('connect');
    }).then(function () {
      $('connect-submit').disabled = false;
      $('connect-submit').textContent = 'Se connecter \u00e0 ma feuille';
    });
  });

  function changeKey() {
    if (queue.size && !confirm('Des modifications ne sont pas encore parties. Changer la cl\u00e9 quand m\u00eame ?')) return;
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
  //  Profils
  // =====================================================================

  function openProfiles() {
    show('loading', 'Recherche des profils\u2026');
    return api('listProfiles').then(function (data) {
      state.profiles = data.profiles || [];
      renderProfiles();
      hideBanner('profiles-error');
      show('profiles');
    }).catch(function (err) {
      showBanner('profiles-error', 'Chargement des profils impossible : ' + err.message);
      renderProfiles();
      show('profiles');
    });
  }

  function renderProfiles() {
    var box = $('profile-list');
    if (!state.profiles.length) {
      box.innerHTML = '<p class="empty">Aucun profil pour le moment. Cr\u00e9e le premier ci-dessous.</p>';
      return;
    }
    box.innerHTML = state.profiles.map(function (p) {
      return '<button class="profile-card" type="button" data-id="' + esc(p.id) + '">' +
             '<span class="avatar" aria-hidden="true">' + esc(initials(p.name)) + '</span>' +
             '<span>' + esc(p.name) + '</span>' +
             '<span class="go" aria-hidden="true">\u2192</span></button>';
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

    show('loading', 'Cr\u00e9ation du profil\u2026');
    api('createProfile', { name: name }).then(function (data) {
      input.value = '';
      state.profiles.push(data.profile);
      return seedJobTypes(data.profile.id).then(function () {
        return openProfile(data.profile.id);
      });
    }).catch(function (err) {
      showBanner('profiles-error', 'Cr\u00e9ation impossible : ' + err.message);
      show('profiles');
    });
  });

  /** Un perfil nuevo arranca con tres tipos de puesto vacios, como el documento. */
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
    if (queue.size && !confirm('Des modifications ne sont pas encore parties. Elles seront ' +
        'enregistr\u00e9es dans le profil de ' + state.profile.name +
        ' quand m\u00eame. Changer de profil ?')) return;
    localStorage.removeItem(LS_PROFILE);
    state.profileId = null;
    openProfiles();
  });

  function openProfile(id) {
    show('loading', 'Ouverture de ton document\u2026');
    state.profileId = id;
    return api('loadProfile', { profileId: id }).then(function (data) {
      state.profile = byId(state.profiles, id) || { id: id, name: '?' };
      state.jobTypes = data.jobTypes || [];
      state.applications = data.applications || [];
      state.channels = data.channels || [];
      state.companies = data.companies || [];
      state.questions = data.questions || [];
      state.learnings = data.learnings || [];
      state.contacts = data.contacts || [];
      localStorage.setItem(LS_PROFILE, id);
      renderApp();
      hideBanner('app-error');
      setSaveState('idle');
      show('app');
    }).catch(function (err) {
      showBanner('profiles-error', 'Ouverture du profil impossible : ' + err.message);
      show('profiles');
    });
  }

  $('btn-reload-app').addEventListener('click', function () {
    if (queue.size && !confirm('Des modifications ne sont pas encore parties. Recharger quand m\u00eame ?')) return;
    queue.clear();
    openProfile(state.profileId);
  });

  // =====================================================================
  //  Document
  // =====================================================================

  function renderApp() {
    $('profile-name').textContent = state.profile.name;
    $('profile-avatar').textContent = initials(state.profile.name);
    renderChannels();
    renderJobTypes();
    renderCompanies();
    renderTracking();
    renderAllQuestions();
  }

  function selectHtml(list, value, field, extra) {
    var options = list.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' +
             esc(o.label) + '</option>';
    }).join('');
    return '<select class="cell-select" data-field="' + field + '" data-tone="' + toneOf(list, value) + '"' +
           (extra || '') + '>' + options + '</select>';
  }

  // ------------------------------------------------------- 1. canaux

  function channelId(key) {
    return state.profileId + '::' + key;
  }

  /** Devuelve (creandola si hace falta) la fila guardada de un canal. */
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

  function customChannels() {
    return state.channels.filter(function (c) {
      return !CHANNELS.some(function (d) { return d.key === c.channelKey; });
    });
  }

  function renderChannels() {
    var html = CHANNELS.map(function (def) {
      var row = state.channels.filter(function (c) { return c.channelKey === def.key; })[0] || {};
      var links = def.links.map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
      }).join('<span class="sep">\u00b7</span>');
      var name = '<span class="ch-name" title="' + esc(def.why) + '">' + esc(def.name) + '</span>';
      return channelHtml(def.key, name, links, row.hecho === 'si', row.notas || '', false);
    }).join('');

    html += customChannels().map(function (row) {
      var links = row.url
        ? '<a href="' + esc(normalizeUrl(row.url)) + '" target="_blank" rel="noopener">Ouvrir</a>'
        : '<input class="ch-url" data-cfield="url" value="' + esc(row.url) +
          '" placeholder="https://\u2026" spellcheck="false">';
      var name = '<input class="ch-name-input" data-cfield="name" value="' + esc(row.name) +
                 '" placeholder="Nom du canal">';
      return channelHtml(row.channelKey, name, links, row.hecho === 'si', row.notas || '', true);
    }).join('');

    $('channels').innerHTML = html;
    updateChannelCount();
  }

  function channelHtml(key, nameHtml, linksHtml, done, notas, isCustom) {
    return '<div class="channel' + (done ? ' is-done' : '') + '" data-ckey="' + esc(key) + '">' +
      '<input class="channel-check" type="checkbox" data-cfield="hecho"' + (done ? ' checked' : '') +
        ' aria-label="Marquer ce canal comme pr\u00eat">' +
      '<div class="ch-main">' + nameHtml + '</div>' +
      '<div class="ch-links">' + linksHtml + '</div>' +
      '<input class="channel-note" data-cfield="notas" value="' + esc(notas) + '" placeholder="Notes\u2026">' +
      (isCustom ? '<button class="row-del" type="button" data-cdel="1" aria-label="Retirer ce canal">\u00d7</button>'
                : '<span class="ch-spacer"></span>') +
      '</div>';
  }

  function updateChannelCount() {
    var done = state.channels.filter(function (c) { return c.hecho === 'si'; }).length;
    var total = CHANNELS.length + customChannels().length;
    $('channels-count').textContent = done + ' sur ' + total + ' pr\u00eats';
  }

  $('channels').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-cfield');
    if (!field || e.target.type === 'checkbox') return;
    var row = channelRow(e.target.closest('.channel').getAttribute('data-ckey'));
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
    updateChannelCount();
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
    var inputs = $('channels').querySelectorAll('.ch-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // -------------------------------------------------- 2. types de poste

  function renderJobTypes() {
    var body = $('jobtypes-body');
    if (!state.jobTypes.length) {
      body.innerHTML = '<tr><td colspan="5" data-label=""><p class="empty" style="margin:10px">' +
        'Ajoute le premier type de poste qui t\u2019int\u00e9resse.</p></td></tr>';
    } else {
      body.innerHTML = state.jobTypes.map(function (r, i) {
        return '<tr data-id="' + esc(r.id) + '">' +
          '<td data-label="Type de poste"><input class="cell-input" data-field="tipo" value="' + esc(r.tipo) +
            '" placeholder="Type de poste ' + (i + 1) + '"></td>' +
          '<td data-label="Pourquoi \u00e7a m\u2019int\u00e9resse ?"><textarea class="cell-input" data-field="porQue" ' +
            'rows="1" placeholder="Ce qui t\u2019attire dans ce type de travail">' + esc(r.porQue) + '</textarea></td>' +
          '<td data-label="Niveau de fran\u00e7ais">' + selectHtml(NIVEAUX, r.nivelFrances, 'nivelFrances') + '</td>' +
          '<td data-label="Priorit\u00e9">' + selectHtml(PRIORITES, r.prioridad, 'prioridad') + '</td>' +
          '<td class="cell-actions"><button class="row-del" type="button" data-del="1" ' +
            'aria-label="Retirer ce type de poste">\u00d7</button></td>' +
        '</tr>';
      }).join('');
    }
    $('jobtypes-hint').textContent = state.jobTypes.length
      ? 'Chaque type de poste a son propre tableau de suivi plus bas.'
      : '';
    autoGrowAll(body);
  }

  $('jobtypes-body').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field) return;
    var row = byId(state.jobTypes, e.target.closest('tr').getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    if (field === 'tipo') updateTrackingTitle(row);
    enqueue('jobtype:' + row.id, 'upsertJobType', row);
  });

  $('jobtypes-body').addEventListener('change', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field || e.target.tagName !== 'SELECT') return;
    var row = byId(state.jobTypes, e.target.closest('tr').getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    e.target.setAttribute('data-tone', toneOf(field === 'prioridad' ? PRIORITES : NIVEAUX, e.target.value));
    enqueue('jobtype:' + row.id, 'upsertJobType', row);
  });

  $('jobtypes-body').addEventListener('click', function (e) {
    if (!e.target.getAttribute('data-del')) return;
    var id = e.target.closest('tr').getAttribute('data-id');
    var row = byId(state.jobTypes, id);
    if (!row) return;
    var goneApps = state.applications.filter(function (a) { return a.jobTypeId === id; }).map(function (a) { return a.id; });
    var msg = goneApps.length
      ? 'Retirer \u00ab ' + (row.tipo || 'ce type de poste') + ' \u00bb et ses ' + goneApps.length + ' candidature(s) ?'
      : 'Retirer cette ligne ?';
    if (!confirm(msg)) return;

    state.jobTypes = state.jobTypes.filter(function (r) { return r.id !== id; });
    state.applications = state.applications.filter(function (a) { return a.jobTypeId !== id; });
    ['questions', 'learnings', 'contacts'].forEach(function (k) {
      state[k] = state[k].filter(function (r) { return goneApps.indexOf(r.applicationId) < 0; });
    });
    enqueue('jobtype-del:' + id, 'deleteJobType', { id: id });
    renderJobTypes();
    renderTracking();
    renderAllQuestions();
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

  // ---------------------------------------------------- 3. entreprises

  /**
   * La candidatura se enlaza con la empresa por NOMBRE (sin distinguir
   * mayusculas ni espacios sobrantes): el campo sigue siendo texto libre.
   */
  function companyForApp(app) {
    var n = String((app && app.empresa) || '').trim().toLowerCase();
    if (!n) return null;
    return state.companies.filter(function (c) {
      return String(c.name || '').trim().toLowerCase() === n;
    })[0] || null;
  }

  function hasPoint(row) {
    return !!(row && row.lat && row.lon && !isNaN(Number(row.lat)) && !isNaN(Number(row.lon)));
  }

  /**
   * El lugar de una candidatura: el suyo si lo tiene, y si no el de su
   * empresa. Se calcula al mostrar, no se copia: cambiar la direccion de la
   * empresa mueve todas las candidaturas que no la hayan sobreescrito.
   */
  function effectiveLocation(app) {
    if (hasPoint(app)) {
      return { lat: Number(app.lat), lon: Number(app.lon), inherited: false };
    }
    var c = companyForApp(app);
    if (hasPoint(c)) {
      return { lat: Number(c.lat), lon: Number(c.lon), inherited: true, company: c };
    }
    return null;
  }

  function round6(n) {
    return String(Math.round(Number(n) * 1e6) / 1e6);
  }

  function companyLabel(c) {
    return String((c && c.name) || '').trim() || 'Entreprise sans nom';
  }

  function sameName(a, b) {
    a = String(a || '').trim().toLowerCase();
    return !!a && a === String(b || '').trim().toLowerCase();
  }

  function renderCompanies() {
    var body = $('companies-body');

    if (!state.companies.length) {
      body.innerHTML = '<tr><td colspan="4" data-label=""><p class="empty" style="margin:10px">' +
        'Ajoute une entreprise : son nom servira \u00e0 l\u2019autocompl\u00e9tion du suivi, et son ' +
        'adresse au lieu par d\u00e9faut de tes candidatures.</p></td></tr>';
    } else {
      body.innerHTML = state.companies.map(function (c) {
        var used = state.applications.filter(function (a) {
          return sameName(a.empresa, c.name);
        }).length;
        return '<tr data-coid="' + esc(c.id) + '">' +
          '<td data-label="Nom">' +
            '<input class="cell-input" data-cofield="name" value="' + esc(c.name) +
              '" placeholder="Nom de l\u2019entreprise">' +
            (used ? '<div class="co-used">' + used +
              (used === 1 ? ' candidature' : ' candidatures') + '</div>' : '') +
          '</td>' +
          '<td data-label="Description"><textarea class="cell-input" data-cofield="description" ' +
            'rows="1" placeholder="Ce qu\u2019ils font, pourquoi ils t\u2019int\u00e9ressent">' +
            esc(c.description) + '</textarea></td>' +
          '<td data-label="Adresse">' +
            '<div class="co-geo">' +
              '<input class="cell-input" data-cofield="ubicacion" value="' + esc(c.ubicacion) +
                '" placeholder="Adresse, ville">' +
              '<button class="btn btn--sm" type="button" data-co-geocode="1">Chercher</button>' +
            '</div>' +
            '<div class="co-coord">' + (hasPoint(c)
              ? '\u2299 ' + esc(c.lat) + ', ' + esc(c.lon)
              : '<span class="co-noplace">pas encore sur la carte</span>') + '</div>' +
          '</td>' +
          '<td class="cell-actions"><button class="row-del" type="button" data-co-del="1" ' +
            'aria-label="Retirer cette entreprise">\u00d7</button></td>' +
        '</tr>';
      }).join('');
    }

    var placed = state.companies.filter(hasPoint).length;
    $('companies-count').textContent = state.companies.length
      ? state.companies.length + (state.companies.length === 1 ? ' entreprise' : ' entreprises') +
        ' \u00b7 ' + placed + ' sur la carte'
      : '';

    updateCompanyDatalist();
    autoGrowAll(body);
    initCompaniesMap();
    syncCompanyMarkers();
    coHl = null;   // la fila resaltada ya no existe tras reconstruir la tabla
  }

  /**
   * Resalta el pin de una empresa mientras el raton (o el foco) esta en su
   * fila. Se guarda cual esta resaltada para no repintar en cada mousemove.
   */
  function highlightCompany(id) {
    if (coHl === id) return;
    if (coHl) markerHighlight(coHl, false);
    coHl = id;
    if (id) markerHighlight(id, true);
  }

  function markerHighlight(id, on) {
    var tr = $('companies-body').querySelector('tr[data-coid="' + cssEsc(id) + '"]');
    if (tr) tr.classList.toggle('is-hl', on);

    var mk = coMarkers[id];
    if (!mk) return;
    // Por delante de los demas mientras esta resaltado.
    if (mk.setZIndexOffset) mk.setZIndexOffset(on ? 1000 : 0);
    var el = mk.getElement && mk.getElement();
    if (el) el.classList.toggle('marker-hl', on);
    if (on) { if (mk.openTooltip) mk.openTooltip(); }
    else if (mk.closeTooltip) mk.closeTooltip();
  }

  function rowCompanyId(target) {
    var tr = target && target.closest && target.closest('tr[data-coid]');
    return tr ? tr.getAttribute('data-coid') : null;
  }

  // mouseover/out en vez de mouseenter/leave: estos ultimos no burbujean.
  $('companies-body').addEventListener('mouseover', function (e) {
    highlightCompany(rowCompanyId(e.target));
  });

  $('companies-body').addEventListener('mouseout', function (e) {
    var tr = e.target.closest && e.target.closest('tr[data-coid]');
    // Moverse dentro de la misma fila no cuenta como salir.
    if (tr && e.relatedTarget && tr.contains(e.relatedTarget)) return;
    highlightCompany(null);
  });

  // Mismo efecto con el teclado, y en el movil, donde no hay raton.
  $('companies-body').addEventListener('focusin', function (e) {
    highlightCompany(rowCompanyId(e.target));
  });
  $('companies-body').addEventListener('focusout', function (e) {
    var tr = e.target.closest && e.target.closest('tr[data-coid]');
    if (tr && e.relatedTarget && tr.contains(e.relatedTarget)) return;
    highlightCompany(null);
  });

  function updateCompanyDatalist() {
    var seen = {};
    var names = [];
    state.companies.forEach(function (c) {
      var n = String(c.name || '').trim();
      if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; names.push(n); }
    });
    $('companies-list').innerHTML = names.map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    }).join('');
  }

  function initCompaniesMap() {
    var box = $('companies-map');
    if (coMap) {
      // La vista pudo estar oculta: hay que remedir el contenedor.
      setTimeout(function () { if (coMap) coMap.invalidateSize(); }, 60);
      return;
    }
    if (typeof L === 'undefined') {
      box.innerHTML = '<p class="empty" style="margin:0">La carte n\u2019a pas pu se charger ' +
        '(pas de connexion ?). Les adresses en texte sont quand m\u00eame enregistr\u00e9es.</p>';
      return;
    }
    coMap = L.map(box, { scrollWheelZoom: false }).setView(STRASBOURG, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(coMap);
    setTimeout(function () { if (coMap) coMap.invalidateSize(); }, 60);
  }

  /** Pone al dia los marcadores sin recrear el mapa. */
  function syncCompanyMarkers() {
    if (!coMap) return;

    Object.keys(coMarkers).forEach(function (id) {
      var c = byId(state.companies, id);
      if (!c || !hasPoint(c)) {
        coMap.removeLayer(coMarkers[id]);
        delete coMarkers[id];
      }
    });

    var pts = [];
    state.companies.forEach(function (c) {
      if (!hasPoint(c)) return;
      var pos = [Number(c.lat), Number(c.lon)];
      pts.push(pos);
      if (coMarkers[c.id]) {
        coMarkers[c.id].setLatLng(pos);
        if (coMarkers[c.id].setTooltipContent) coMarkers[c.id].setTooltipContent(companyLabel(c));
        return;
      }
      var mk = L.marker(pos, { draggable: true }).addTo(coMap);
      if (mk.bindTooltip) mk.bindTooltip(companyLabel(c));
      mk.on('dragend', function () {
        var row = byId(state.companies, c.id);
        if (!row) return;
        var pp = mk.getLatLng();
        row.lat = round6(pp.lat);
        row.lon = round6(pp.lng);
        enqueue('company:' + row.id, 'upsertCompany', row);
        renderCompanies();
        $('companies-map-hint').textContent = companyLabel(row) + ' : ' + row.lat + ', ' + row.lon + '.';
      });
      coMarkers[c.id] = mk;
    });

    // Solo se recentra cuando cambia el conjunto de puntos, para no pelearse
    // con el usuario cada vez que mueve el mapa a mano.
    var key = pts.map(function (p) { return p.join(','); }).sort().join('|');
    if (key !== coFitKey) {
      coFitKey = key;
      if (pts.length === 1) coMap.setView(pts[0], 14);
      else if (pts.length > 1 && coMap.fitBounds) coMap.fitBounds(pts, { padding: [30, 30] });
    }
  }

  $('companies-body').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-cofield');
    if (!field) return;
    var row = byId(state.companies, e.target.closest('tr').getAttribute('data-coid'));
    if (!row) return;
    row[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    if (field === 'name') {
      updateCompanyDatalist();
      if (coMarkers[row.id] && coMarkers[row.id].setTooltipContent) {
        coMarkers[row.id].setTooltipContent(companyLabel(row));
      }
    }
    enqueue('company:' + row.id, 'upsertCompany', row);
  });

  $('companies-body').addEventListener('click', function (e) {
    var geo = e.target.closest('[data-co-geocode]');
    if (geo) return geocodeCompany(geo.closest('tr').getAttribute('data-coid'));

    if (!e.target.getAttribute('data-co-del')) return;
    var id = e.target.closest('tr').getAttribute('data-coid');
    var row = byId(state.companies, id);
    if (!row) return;
    if (!confirm('Retirer \u00ab ' + companyLabel(row) + ' \u00bb ? Les candidatures ne sont pas ' +
        'supprim\u00e9es, elles perdent juste l\u2019adresse h\u00e9rit\u00e9e.')) return;
    state.companies = state.companies.filter(function (c) { return c.id !== id; });
    enqueue('company-del:' + id, 'deleteCompany', { id: id });
    coFitKey = '';
    renderCompanies();
  });

  $('btn-add-company').addEventListener('click', function () {
    var row = {
      id: uid(), profileId: state.profileId, position: nextPosition(state.companies),
      name: '', description: '', ubicacion: '', lat: '', lon: ''
    };
    state.companies.push(row);
    enqueue('company:' + row.id, 'upsertCompany', row);
    renderCompanies();
    focusLast('#companies-body [data-cofield="name"]');
  });

  function geocodeCompany(id) {
    var row = byId(state.companies, id);
    if (!row) return;
    var hint = $('companies-map-hint');
    var q = String(row.ubicacion || '').trim();
    if (!q) { hint.textContent = '\u00c9cris d\u2019abord une adresse pour cette entreprise.'; return; }
    if (!coMap) {
      hint.textContent = 'La carte n\u2019est pas disponible, mais l\u2019adresse est enregistr\u00e9e.';
      return;
    }

    hint.textContent = 'Recherche de \u00ab ' + q + ' \u00bb\u2026';
    geocodeAddress(q).then(function (pt) {
      if (!pt) {
        // Se posa en el centro de Estrasburgo para poder arrastrarlo al sitio
        // correcto: mejor eso que dejar la empresa fuera del mapa.
        row.lat = round6(STRASBOURG[0]);
        row.lon = round6(STRASBOURG[1]);
        enqueue('company:' + row.id, 'upsertCompany', row);
        coFitKey = '';
        renderCompanies();
        hint.textContent = 'Adresse introuvable. Le point a \u00e9t\u00e9 pos\u00e9 au centre de ' +
          'Strasbourg : fais-le glisser au bon endroit, ou pr\u00e9cise l\u2019adresse (avec la ville).';
        return;
      }
      row.lat = round6(pt.lat);
      row.lon = round6(pt.lon);
      enqueue('company:' + row.id, 'upsertCompany', row);
      coFitKey = '';
      renderCompanies();
      coMap.setView([pt.lat, pt.lon], 15);
      hint.textContent = companyLabel(row) + ' plac\u00e9e. Tu peux affiner en faisant glisser le point.';
    }).catch(function () {
      hint.textContent = 'La recherche d\u2019adresse n\u2019a pas r\u00e9pondu. R\u00e9essaie dans un instant.';
    });
  }

  /** Nominatim (OpenStreetMap). Devuelve null si no encuentra nada. */
  function geocodeAddress(query) {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(query);
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (list) {
      if (!list || !list.length) return null;
      return { lat: Number(list[0].lat), lon: Number(list[0].lon) };
    });
  }

  // ---------------------------------------------------------- 4. suivi

  function jobTypeLabel(row, index) {
    return (row.tipo && row.tipo.trim()) || 'Type de poste ' + (index + 1);
  }

  function detailCount(appId) {
    return forApp(state.questions, appId).length +
           forApp(state.learnings, appId).length +
           forApp(state.contacts, appId).length;
  }

  function renderTracking() {
    var box = $('tracking');

    if (!state.jobTypes.length) {
      box.innerHTML = '<p class="empty">Ajoute un type de poste plus haut et son tableau de suivi ' +
        'appara\u00eetra ici.</p>';
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
            '<th style="width:11%">Date</th>' +
            '<th style="width:16%">Entreprise</th>' +
            '<th style="width:20%">Poste exact</th>' +
            '<th style="width:13%">Source / canal</th>' +
            '<th style="width:14%">Statut</th>' +
            '<th style="width:9%">Note</th>' +
            '<th style="width:17%">Prochaine action</th>' +
            '<th style="width:82px"><span class="sr-only">Actions</span></th>' +
          '</tr></thead>' +
          '<tbody>' + (rows.length ? rows.map(applicationHtml).join('')
            : '<tr><td colspan="8" data-label=""><p class="empty" style="margin:10px">' +
              'Aucune candidature pour l\u2019instant.</p></td></tr>') +
          '</tbody>' +
        '</table></div>' +
        '<div class="table-foot"><button class="btn btn--sm" type="button" data-add-app="' + esc(jt.id) + '">' +
          '+ Ajouter une candidature</button></div>' +
      '</section>';
    }).join('');

    renderStats();
    autoGrowAll(box);
  }

  function applicationHtml(a) {
    var fuentes = ['<option value=""></option>'].concat(CHANNELS.map(function (c) {
      return '<option value="' + esc(c.name) + '"' + (c.name === a.fuente ? ' selected' : '') + '>' +
             esc(c.name) + '</option>';
    }));
    // Una fuente escrita a mano (o un canal propio) tiene que seguir apareciendo.
    if (a.fuente && a.fuente !== 'Autre' && !CHANNELS.some(function (c) { return c.name === a.fuente; })) {
      fuentes.push('<option value="' + esc(a.fuente) + '" selected>' + esc(a.fuente) + '</option>');
    }
    fuentes.push('<option value="Autre"' + (a.fuente === 'Autre' ? ' selected' : '') +
      '>Autre / contact direct</option>');

    var n = detailCount(a.id);

    return '<tr data-id="' + esc(a.id) + '">' +
      '<td data-label="Date"><input class="cell-input" type="date" data-field="fecha" value="' + esc(a.fecha) + '"></td>' +
      '<td data-label="Entreprise"><input class="cell-input" data-field="empresa" ' +
        'list="companies-list" autocomplete="off" value="' + esc(a.empresa) +
        '" placeholder="Entreprise"></td>' +
      '<td data-label="Poste exact">' +
        '<input class="cell-input" data-field="puesto" value="' + esc(a.puesto) +
          '" placeholder="Titre de l\u2019offre">' +
        '<div class="cell-sub">' +
          '<input class="cell-sub-input" data-field="enlace" value="' + esc(a.enlace) +
            '" placeholder="Lien de l\u2019offre (optionnel)" inputmode="url" spellcheck="false">' +
          linkOutHtml(a.enlace) +
        '</div>' +
      '</td>' +
      '<td data-label="Source / canal"><select class="cell-select" data-field="fuente">' +
        fuentes.join('') + '</select></td>' +
      '<td data-label="Statut">' + selectHtml(STATUTS, a.estado, 'estado') + '</td>' +
      '<td data-label="Note">' + selectHtml(NOTES, a.nota, 'nota') + '</td>' +
      '<td data-label="Prochaine action"><input class="cell-input" data-field="proximaAccion" value="' +
        esc(a.proximaAccion) + '" placeholder="Ex. : relancer dans 10 jours"></td>' +
      '<td class="cell-actions cell-actions--wide">' +
        '<button class="btn-fiche" type="button" data-fiche="1" title="Ouvrir la fiche d\u00e9taill\u00e9e">Fiche' +
          (n ? '<span class="fiche-badge">' + n + '</span>' : '') + '</button>' +
        '<button class="row-del" type="button" data-del="1" aria-label="Retirer cette candidature">\u00d7</button>' +
      '</td>' +
    '</tr>';
  }

  /** La flechita para abrir la oferta. Solo aparece si hay algo escrito. */
  function linkOutHtml(value) {
    if (!String(value || '').trim()) return '<span class="link-out" data-link-out hidden></span>';
    return '<a class="link-out" data-link-out href="' + esc(normalizeUrl(value)) +
           '" target="_blank" rel="noopener" title="Ouvrir l\u2019offre">\u2197</a>';
  }

  function refreshLinkOut(input) {
    var box = input.closest('.cell-sub');
    if (!box) return;
    var old = box.querySelector('[data-link-out]');
    var fresh = document.createElement('div');
    fresh.innerHTML = linkOutHtml(input.value);
    if (old) box.replaceChild(fresh.firstChild, old);
  }

  function countLabel(rows) {
    if (!rows.length) return '';
    var sent = rows.filter(function (r) { return STATUTS_ENVOYES.indexOf(r.estado) >= 0; }).length;
    return rows.length + (rows.length === 1 ? ' candidature' : ' candidatures') +
           (sent ? ' \u00b7 ' + sent + ' en cours' : '');
  }

  $('tracking').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field) return;
    var row = byId(state.applications, e.target.closest('tr').getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    if (field === 'enlace') refreshLinkOut(e.target);
    if (field === 'empresa') { refreshQuestionCompany(row); renderCompanies(); }
    enqueue('app:' + row.id, 'upsertApplication', row);
  });

  $('tracking').addEventListener('change', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field || e.target.tagName !== 'SELECT') return;
    var tr = e.target.closest('tr');
    var row = byId(state.applications, tr.getAttribute('data-id'));
    if (!row) return;
    row[field] = e.target.value;
    if (field === 'estado') {
      e.target.setAttribute('data-tone', toneOf(STATUTS, e.target.value));
      refreshCounts(tr.closest('section[data-jt]'));
      renderStats();
    }
    if (field === 'nota') e.target.setAttribute('data-tone', toneOf(NOTES, e.target.value));
    enqueue('app:' + row.id, 'upsertApplication', row);
  });

  $('tracking').addEventListener('click', function (e) {
    var addFor = e.target.getAttribute('data-add-app');
    if (addFor) return addApplication(addFor);

    var fiche = e.target.closest('[data-fiche]');
    if (fiche) return openDetail(fiche.closest('tr').getAttribute('data-id'));

    if (!e.target.getAttribute('data-del')) return;
    var id = e.target.closest('tr').getAttribute('data-id');
    var row = byId(state.applications, id);
    if (!row) return;
    var label = row.empresa || row.puesto;
    if (label && !confirm('Retirer la candidature chez \u00ab ' + label + ' \u00bb et tout son d\u00e9tail ?')) return;
    state.applications = state.applications.filter(function (a) { return a.id !== id; });
    ['questions', 'learnings', 'contacts'].forEach(function (k) {
      state[k] = state[k].filter(function (r) { return r.applicationId !== id; });
    });
    enqueue('app-del:' + id, 'deleteApplication', { id: id });
    renderTracking();
    renderAllQuestions();
  });

  function addApplication(jobTypeId) {
    var mine = state.applications.filter(function (a) { return a.jobTypeId === jobTypeId; });
    var row = {
      id: uid(), profileId: state.profileId, jobTypeId: jobTypeId,
      position: nextPosition(mine),
      fecha: today(), empresa: '', puesto: '', fuente: '', estado: '', proximaAccion: '',
      enlace: '', nota: '', misiones: '', sueldo: '', modalidad: '', ventajas: '',
      ubicacion: '', lat: '', lon: ''
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

  function refreshCounts(section) {
    if (!section) return;
    var id = section.getAttribute('data-jt');
    var el = section.querySelector('[data-jt-count]');
    if (el) el.textContent = countLabel(state.applications.filter(function (a) { return a.jobTypeId === id; }));
  }

  function renderStats() {
    var all = state.applications;
    var envoyees = all.filter(function (a) { return STATUTS_ENVOYES.indexOf(a.estado) >= 0; }).length;
    var entretiens = all.filter(function (a) {
      return a.estado === 'Entretien' || a.estado === 'Accept\u00e9e';
    }).length;
    var aEnvoyer = all.filter(function (a) { return !a.estado; }).length;

    var cards = [
      { value: all.length, label: all.length === 1 ? 'candidature' : 'candidatures' },
      { value: envoyees, label: 'd\u00e9j\u00e0 envoy\u00e9es' },
      { value: entretiens, label: entretiens === 1 ? 'entretien' : 'entretiens' },
      { value: aEnvoyer, label: '\u00e0 envoyer' }
    ];

    $('stats').innerHTML = all.length ? cards.map(function (c) {
      return '<div class="stat"><div class="stat-value">' + c.value + '</div>' +
             '<div class="stat-label">' + esc(c.label) + '</div></div>';
    }).join('') : '';
  }

  // ------------------------------------------- 4. questions d'entretien

  function appLabel(app) {
    if (!app) return '\u2014';
    return app.empresa || app.puesto || 'Candidature sans nom';
  }

  function renderAllQuestions() {
    var box = $('all-questions');
    if (!state.questions.length) {
      box.innerHTML = '<p class="empty">Les questions s\u2019ajoutent depuis la fiche d\u2019une candidature ' +
        '(bouton <strong>Fiche</strong> dans le tableau de suivi). Elles se retrouvent toutes ici.</p>';
      return;
    }

    // Ordenadas por candidatura, siguiendo el orden de las candidaturas.
    var order = {};
    state.applications.forEach(function (a, i) { order[a.id] = i; });
    var rows = state.questions.slice().sort(function (x, y) {
      var dx = (order[x.applicationId] === undefined ? 9999 : order[x.applicationId]);
      var dy = (order[y.applicationId] === undefined ? 9999 : order[y.applicationId]);
      return dx - dy || Number(x.position || 0) - Number(y.position || 0);
    });

    box.innerHTML = '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th style="width:30%">Question pos\u00e9e</th>' +
        '<th style="width:16%">Entreprise</th>' +
        '<th style="width:11%">Su r\u00e9pondre ?</th>' +
        '<th style="width:39%">R\u00e9ponse \u00e0 donner la prochaine fois</th>' +
        '<th style="width:44px"><span class="sr-only">Actions</span></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (q) {
        var app = byId(state.applications, q.applicationId);
        return '<tr data-qid="' + esc(q.id) + '">' +
          '<td data-label="Question pos\u00e9e"><textarea class="cell-input" data-qfield="question" rows="1" ' +
            'placeholder="La question">' + esc(q.question) + '</textarea></td>' +
          '<td data-label="Entreprise"><button class="link-btn" type="button" data-open-app="' +
            esc(q.applicationId) + '">' + esc(appLabel(app)) + '</button></td>' +
          '<td data-label="Su r\u00e9pondre ?">' + selectHtml(REPONDU, q.answered, 'answered', ' data-qsel="1"') + '</td>' +
          '<td data-label="R\u00e9ponse \u00e0 donner"><textarea class="cell-input" data-qfield="answer" rows="1" ' +
            'placeholder="Ce qu\u2019il faudrait r\u00e9pondre">' + esc(q.answer) + '</textarea></td>' +
          '<td class="cell-actions"><button class="row-del" type="button" data-qdel="1" ' +
            'aria-label="Retirer cette question">\u00d7</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="table-foot"><span class="count-hint">' + state.questions.length +
        (state.questions.length === 1 ? ' question' : ' questions') + ' au total</span></div>';

    autoGrowAll(box);
  }

  /** El nombre de la empresa sale en la seccion 4: se refresca en vivo. */
  function refreshQuestionCompany(app) {
    var cells = $('all-questions').querySelectorAll('[data-open-app="' + cssEsc(app.id) + '"]');
    Array.prototype.forEach.call(cells, function (el) { el.textContent = appLabel(app); });
  }

  $('all-questions').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-qfield');
    if (!field) return;
    var q = byId(state.questions, e.target.closest('tr').getAttribute('data-qid'));
    if (!q) return;
    q[field] = e.target.value;
    autoGrow(e.target);
    enqueue('question:' + q.id, 'upsertQuestion', q);
  });

  $('all-questions').addEventListener('change', function (e) {
    if (!e.target.getAttribute('data-qsel')) return;
    var q = byId(state.questions, e.target.closest('tr').getAttribute('data-qid'));
    if (!q) return;
    q.answered = e.target.value;
    e.target.setAttribute('data-tone', toneOf(REPONDU, e.target.value));
    enqueue('question:' + q.id, 'upsertQuestion', q);
  });

  $('all-questions').addEventListener('click', function (e) {
    var open = e.target.closest('[data-open-app]');
    if (open) return openDetail(open.getAttribute('data-open-app'));

    if (!e.target.getAttribute('data-qdel')) return;
    var id = e.target.closest('tr').getAttribute('data-qid');
    if (!confirm('Retirer cette question ?')) return;
    state.questions = state.questions.filter(function (q) { return q.id !== id; });
    enqueue('question-del:' + id, 'deleteQuestion', { id: id });
    renderAllQuestions();
    renderTracking();
  });

  // =====================================================================
  //  Fiche detaillee
  // =====================================================================

  function fieldBlock(label, control) {
    return '<div class="field"><label>' + esc(label) + '</label>' + control + '</div>';
  }

  function openDetail(appId) {
    var app = byId(state.applications, appId);
    if (!app) return;
    openAppId = appId;

    $('modal-title').textContent = appLabel(app);
    $('modal-sub').textContent = [app.puesto, app.fecha].filter(Boolean).join(' \u00b7 ') ||
      'Fiche de candidature';

    $('modal-body').innerHTML =
      '<section class="md-block">' +
        '<h3 class="md-h">Le poste</h3>' +
        '<div class="md-grid">' +
          fieldBlock('Fourchette de salaire', '<input class="input" data-af="sueldo" value="' + esc(app.sueldo) +
            '" placeholder="Ex. : 32-38 k\u20ac brut">') +
          fieldBlock('Modalit\u00e9', selectHtml(MODALITES, app.modalidad, 'modalidad', ' data-af-sel="modalidad"')) +
          fieldBlock('Note globale', selectHtml(NOTES, app.nota, 'nota', ' data-af-sel="nota"')) +
          fieldBlock('Lien de l\u2019offre', '<input class="input" data-af="enlace" value="' + esc(app.enlace) +
            '" placeholder="https://\u2026" spellcheck="false">') +
        '</div>' +
        fieldBlock('Missions', '<textarea class="input" data-af="misiones" rows="3" ' +
          'placeholder="Ce que le poste demande au quotidien">' + esc(app.misiones) + '</textarea>') +
        fieldBlock('Avantages', '<textarea class="input" data-af="ventajas" rows="2" ' +
          'placeholder="Ex. : tickets restaurant, 50 % transport, 2 jours de t\u00e9l\u00e9travail">' +
          esc(app.ventajas) + '</textarea>') +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">Lieu</h3>' +
        '<div class="md-geo">' +
          '<input class="input" id="md-address" value="' + esc(app.ubicacion) +
            '" placeholder="' + esc(lieuPlaceholder(app)) + '">' +
          '<button class="btn btn--sm" type="button" id="md-geocode">Chercher</button>' +
        '</div>' +
        '<p class="md-hint" id="md-geo-hint"></p>' +
        '<div id="md-map" class="md-map"></div>' +
        '<div id="md-lieu-actions" class="md-lieu-actions"></div>' +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">Questions pos\u00e9es en entretien</h3>' +
        '<div id="md-questions"></div>' +
        '<button class="btn btn--sm" type="button" id="md-add-question">+ Ajouter une question</button>' +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">Ce que j\u2019ai appris</h3>' +
        '<div id="md-learnings"></div>' +
        '<button class="btn btn--sm" type="button" id="md-add-learning">+ Ajouter une info</button>' +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">Contacts dans l\u2019entreprise</h3>' +
        '<div id="md-contacts"></div>' +
        '<button class="btn btn--sm" type="button" id="md-add-contact">+ Ajouter un contact</button>' +
      '</section>';

    renderMdQuestions();
    renderMdLearnings();
    renderMdContacts();

    $('modal').hidden = false;
    document.body.classList.add('modal-open');
    autoGrowAll($('modal-body'));

    // Leaflet necesita que el contenedor ya sea visible para medirse.
    initMap(app);
    updateLieuHint(app);

    $('md-add-question').addEventListener('click', addQuestion);
    $('md-add-learning').addEventListener('click', addLearning);
    $('md-add-contact').addEventListener('click', addContact);
    $('md-geocode').addEventListener('click', geocode);
    $('md-address').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); geocode(); }
    });
  }

  function closeDetail() {
    if (map) { map.remove(); map = null; marker = null; }
    $('modal').hidden = true;
    document.body.classList.remove('modal-open');
    openAppId = null;
    // La nota, el enlace y los contadores se ven en las tablas: hay que refrescarlas.
    renderTracking();
    renderAllQuestions();
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close-modal]')) closeDetail();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal').hidden) closeDetail();
  });

  /** Campos de la propia candidatura, editados dentro de la ficha. */
  $('modal-body').addEventListener('input', function (e) {
    var t = e.target;
    var af = t.getAttribute('data-af');
    var mq = t.getAttribute('data-mq');
    var ml = t.getAttribute('data-ml');
    var mc = t.getAttribute('data-mc');

    if (af) {
      var app = byId(state.applications, openAppId);
      if (!app) return;
      app[af] = t.value;
      if (t.tagName === 'TEXTAREA') autoGrow(t);
      enqueue('app:' + app.id, 'upsertApplication', app);
    } else if (mq) {
      var q = byId(state.questions, t.closest('[data-qid]').getAttribute('data-qid'));
      if (!q) return;
      q[mq] = t.value; autoGrow(t);
      enqueue('question:' + q.id, 'upsertQuestion', q);
    } else if (ml) {
      var l = byId(state.learnings, t.closest('[data-lid]').getAttribute('data-lid'));
      if (!l) return;
      l[ml] = t.value; autoGrow(t);
      enqueue('learning:' + l.id, 'upsertLearning', l);
    } else if (mc) {
      var c = byId(state.contacts, t.closest('[data-cid]').getAttribute('data-cid'));
      if (!c) return;
      c[mc] = t.value;
      enqueue('contact:' + c.id, 'upsertContact', c);
    }
  });

  $('modal-body').addEventListener('change', function (e) {
    var af = e.target.getAttribute('data-af-sel');
    if (af) {
      var app = byId(state.applications, openAppId);
      if (!app) return;
      app[af] = e.target.value;
      e.target.setAttribute('data-tone', toneOf(af === 'nota' ? NOTES : MODALITES, e.target.value));
      enqueue('app:' + app.id, 'upsertApplication', app);
      return;
    }
    if (!e.target.getAttribute('data-mq-sel')) return;
    var q = byId(state.questions, e.target.closest('[data-qid]').getAttribute('data-qid'));
    if (!q) return;
    q.answered = e.target.value;
    e.target.setAttribute('data-tone', toneOf(REPONDU, e.target.value));
    enqueue('question:' + q.id, 'upsertQuestion', q);
  });

  $('modal-body').addEventListener('click', function (e) {
    if (e.target.getAttribute('data-mq-del')) {
      var qid = e.target.closest('[data-qid]').getAttribute('data-qid');
      if (!confirm('Retirer cette question ?')) return;
      state.questions = state.questions.filter(function (q) { return q.id !== qid; });
      enqueue('question-del:' + qid, 'deleteQuestion', { id: qid });
      renderMdQuestions();
    } else if (e.target.getAttribute('data-ml-del')) {
      var lid = e.target.closest('[data-lid]').getAttribute('data-lid');
      state.learnings = state.learnings.filter(function (l) { return l.id !== lid; });
      enqueue('learning-del:' + lid, 'deleteLearning', { id: lid });
      renderMdLearnings();
    } else if (e.target.getAttribute('data-mc-del')) {
      var cid = e.target.closest('[data-cid]').getAttribute('data-cid');
      state.contacts = state.contacts.filter(function (c) { return c.id !== cid; });
      enqueue('contact-del:' + cid, 'deleteContact', { id: cid });
      renderMdContacts();
    }
  });

  // ------------------------------------------------- listas de la ficha

  function renderMdQuestions() {
    var rows = forApp(state.questions, openAppId);
    $('md-questions').innerHTML = rows.length ? rows.map(function (q) {
      return '<div class="md-row" data-qid="' + esc(q.id) + '">' +
        '<div class="md-row-main">' +
          '<textarea class="input" data-mq="question" rows="1" ' +
            'placeholder="La question qu\u2019on t\u2019a pos\u00e9e">' + esc(q.question) + '</textarea>' +
          '<textarea class="input md-answer" data-mq="answer" rows="1" ' +
            'placeholder="R\u00e9ponse \u00e0 donner la prochaine fois">' + esc(q.answer) + '</textarea>' +
        '</div>' +
        '<div class="md-row-side">' +
          '<label class="md-mini">Su r\u00e9pondre ?</label>' +
          selectHtml(REPONDU, q.answered, 'answered', ' data-mq-sel="1"') +
        '</div>' +
        '<button class="row-del" type="button" data-mq-del="1" aria-label="Retirer cette question">\u00d7</button>' +
      '</div>';
    }).join('') : '<p class="empty">Aucune question not\u00e9e pour cette candidature.</p>';
    autoGrowAll($('md-questions'));
  }

  function renderMdLearnings() {
    var rows = forApp(state.learnings, openAppId);
    $('md-learnings').innerHTML = rows.length ? rows.map(function (l) {
      return '<div class="md-row" data-lid="' + esc(l.id) + '">' +
        '<div class="md-row-main">' +
          '<textarea class="input" data-ml="note" rows="1" ' +
            'placeholder="Ex. : l\u2019\u00e9quipe fait 12 personnes, ils migrent vers React">' +
            esc(l.note) + '</textarea>' +
        '</div>' +
        '<button class="row-del" type="button" data-ml-del="1" aria-label="Retirer cette info">\u00d7</button>' +
      '</div>';
    }).join('') : '<p class="empty">Rien de not\u00e9 pour l\u2019instant.</p>';
    autoGrowAll($('md-learnings'));
  }

  function renderMdContacts() {
    var rows = forApp(state.contacts, openAppId);
    $('md-contacts').innerHTML = rows.length ? rows.map(function (c) {
      return '<div class="md-row md-contact" data-cid="' + esc(c.id) + '">' +
        '<div class="md-contact-grid">' +
          '<input class="input" data-mc="name" value="' + esc(c.name) + '" placeholder="Nom">' +
          '<input class="input" data-mc="role" value="' + esc(c.role) + '" placeholder="Poste">' +
          '<input class="input" data-mc="email" type="email" value="' + esc(c.email) +
            '" placeholder="Courriel" spellcheck="false">' +
          '<input class="input" data-mc="phone" type="tel" value="' + esc(c.phone) +
            '" placeholder="T\u00e9l\u00e9phone">' +
        '</div>' +
        '<div class="md-contact-links">' +
          (c.email ? '<a href="mailto:' + esc(c.email) + '" title="\u00c9crire">\u2709</a>' : '') +
          (c.phone ? '<a href="tel:' + esc(String(c.phone).replace(/\s/g, '')) + '" title="Appeler">\u260e</a>' : '') +
        '</div>' +
        '<button class="row-del" type="button" data-mc-del="1" aria-label="Retirer ce contact">\u00d7</button>' +
      '</div>';
    }).join('') : '<p class="empty">Aucun contact enregistr\u00e9.</p>';
  }

  function addQuestion() {
    var row = {
      id: uid(), profileId: state.profileId, applicationId: openAppId,
      position: nextPosition(forApp(state.questions, openAppId)),
      question: '', answered: '', answer: ''
    };
    state.questions.push(row);
    enqueue('question:' + row.id, 'upsertQuestion', row);
    renderMdQuestions();
    focusLast('#md-questions [data-mq="question"]');
  }

  function addLearning() {
    var row = {
      id: uid(), profileId: state.profileId, applicationId: openAppId,
      position: nextPosition(forApp(state.learnings, openAppId)), note: ''
    };
    state.learnings.push(row);
    enqueue('learning:' + row.id, 'upsertLearning', row);
    renderMdLearnings();
    focusLast('#md-learnings [data-ml="note"]');
  }

  function addContact() {
    var row = {
      id: uid(), profileId: state.profileId, applicationId: openAppId,
      position: nextPosition(forApp(state.contacts, openAppId)),
      name: '', role: '', email: '', phone: ''
    };
    state.contacts.push(row);
    enqueue('contact:' + row.id, 'upsertContact', row);
    renderMdContacts();
    focusLast('#md-contacts [data-mc="name"]');
  }

  function focusLast(selector) {
    var els = document.querySelectorAll(selector);
    if (els.length) els[els.length - 1].focus();
  }

  // ----------------------------------------------------------- la carte

  function initMap(app) {
    var box = $('md-map');
    if (typeof L === 'undefined') {
      box.innerHTML = '<p class="empty" style="margin:0">La carte n\u2019a pas pu se charger ' +
        '(pas de connexion ?). L\u2019adresse en texte est quand m\u00eame enregistr\u00e9e.</p>';
      return;
    }

    var loc = effectiveLocation(app);
    var center = loc ? [loc.lat, loc.lon] : STRASBOURG;

    map = L.map(box, { scrollWheelZoom: false }).setView(center, loc ? 15 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    if (loc) placeMarker(center[0], center[1], false);
    map.on('click', function (e) { placeMarker(e.latlng.lat, e.latlng.lng, true); });

    // El contenedor acaba de aparecer: hay que remedirlo.
    setTimeout(function () { if (map) map.invalidateSize(); }, 60);
  }

  function placeMarker(lat, lon, save) {
    if (!map) return;
    if (marker) {
      marker.setLatLng([lat, lon]);
    } else {
      marker = L.marker([lat, lon], { draggable: true }).addTo(map);
      marker.on('dragend', function () {
        var p = marker.getLatLng();
        storeLatLon(p.lat, p.lng);
      });
    }
    if (save) storeLatLon(lat, lon);
  }

  function storeLatLon(lat, lon) {
    var app = byId(state.applications, openAppId);
    if (!app) return;
    app.lat = String(Math.round(lat * 1e6) / 1e6);
    app.lon = String(Math.round(lon * 1e6) / 1e6);
    enqueue('app:' + app.id, 'upsertApplication', app);
    updateLieuHint(app);
  }

  function lieuPlaceholder(app) {
    var c = companyForApp(app);
    var addr = String((c && c.ubicacion) || '').trim();
    if (addr) return 'H\u00e9rit\u00e9 de ' + companyLabel(c) + ' : ' + addr;
    return 'Adresse ou quartier (ex. : 1 place Kl\u00e9ber, Strasbourg)';
  }

  /** Explica de donde sale el lugar y ofrece volver al de la empresa. */
  function updateLieuHint(app) {
    var hint = $('md-geo-hint');
    var actions = $('md-lieu-actions');
    if (!hint || !actions) return;

    var loc = effectiveLocation(app);
    var c = companyForApp(app);
    actions.innerHTML = '';

    if (loc && loc.inherited) {
      hint.textContent = 'Lieu h\u00e9rit\u00e9 de \u00ab ' + companyLabel(loc.company) +
        ' \u00bb. Cherche une adresse ou clique sur la carte pour donner un lieu propre ' +
        '\u00e0 cette candidature.';
    } else if (loc) {
      hint.textContent = 'Lieu propre \u00e0 cette candidature : ' + app.lat + ', ' + app.lon +
        ' \u00b7 tu peux le d\u00e9placer en le faisant glisser.';
      if (hasPoint(c)) {
        actions.innerHTML = '<button class="btn btn--sm" type="button" id="md-lieu-reset">' +
          'Revenir \u00e0 l\u2019adresse de ' + esc(companyLabel(c)) + '</button>';
        $('md-lieu-reset').addEventListener('click', resetLieu);
      }
    } else if (c) {
      hint.textContent = '\u00ab ' + companyLabel(c) + ' \u00bb n\u2019a pas encore d\u2019adresse. ' +
        'Mets-en une ici, ou renseigne-la dans la section Entreprises pour qu\u2019elle serve ' +
        '\u00e0 toutes ses candidatures.';
    } else {
      hint.textContent = 'Cherche une adresse, ou clique directement sur la carte pour poser le point.';
    }
  }

  /** Quita el lugar propio: la candidatura vuelve a heredar el de la empresa. */
  function resetLieu() {
    var app = byId(state.applications, openAppId);
    if (!app) return;
    app.lat = '';
    app.lon = '';
    app.ubicacion = '';
    enqueue('app:' + app.id, 'upsertApplication', app);
    $('md-address').value = '';
    $('md-address').placeholder = lieuPlaceholder(app);
    if (map) { map.remove(); map = null; marker = null; }
    initMap(app);
    updateLieuHint(app);
  }

  /** Busca la direccion con Nominatim (OpenStreetMap). */
  function geocode() {
    var input = $('md-address');
    var q = input.value.trim();
    var hint = $('md-geo-hint');
    var app = byId(state.applications, openAppId);
    if (!app) return;

    // El texto se guarda tal cual, aunque la busqueda no encuentre nada.
    app.ubicacion = input.value;
    enqueue('app:' + app.id, 'upsertApplication', app);

    if (!q) { hint.textContent = '\u00c9cris une adresse pour la chercher.'; return; }
    if (!map) { hint.textContent = 'La carte n\u2019est pas disponible, mais l\u2019adresse est enregistr\u00e9e.'; return; }

    hint.textContent = 'Recherche\u2026';
    geocodeAddress(q).then(function (pt) {
      if (!pt) {
        hint.textContent = 'Adresse introuvable. Tu peux poser le point \u00e0 la main ' +
          'en cliquant sur la carte.';
        return;
      }
      map.setView([pt.lat, pt.lon], 16);
      placeMarker(pt.lat, pt.lon, true);
    }).catch(function () {
      hint.textContent = 'La recherche d\u2019adresse n\u2019a pas r\u00e9pondu. ' +
        'Clique sur la carte pour poser le point.';
    });
  }

  // =====================================================================
  //  Demarrage
  // =====================================================================

  (function boot() {
    var url = localStorage.getItem(LS_URL);
    if (!url) return show('connect');

    state.url = url;
    var wanted = localStorage.getItem(LS_PROFILE);
    show('loading', 'Connexion \u00e0 la feuille\u2026');

    api('listProfiles').then(function (data) {
      state.profiles = data.profiles || [];
      var exists = wanted && state.profiles.some(function (p) { return p.id === wanted; });
      if (exists) return openProfile(wanted);
      renderProfiles();
      show('profiles');
    }).catch(function (err) {
      showBanner('connect-error', 'Connexion impossible : ' + err.message);
      $('connect-url').value = url;
      show('connect');
    });
  })();

})();
