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

  /** Estados especiales de la busqueda con IA. */
  var ST_A_VALIDER = '\u00c0 valider';
  var ST_ECARTEE   = '\u00c9cart\u00e9e';

  var STATUTS = [
    { value: '', label: '\u00c0 envoyer', tone: 'todo' },
    { value: ST_A_VALIDER, label: '\u00c0 valider (IA)', tone: 'ai' },
    { value: 'Envoy\u00e9e', label: 'Envoy\u00e9e', tone: 'sent' },
    { value: 'Relance faite', label: 'Relance faite', tone: 'sent' },
    { value: 'R\u00e9ponse re\u00e7ue', label: 'R\u00e9ponse re\u00e7ue', tone: 'progress' },
    { value: 'Entretien', label: 'Entretien', tone: 'progress' },
    { value: 'Accept\u00e9e', label: 'Accept\u00e9e', tone: 'good' },
    { value: 'Sans r\u00e9ponse', label: 'Sans r\u00e9ponse', tone: 'low' },
    { value: 'Refus\u00e9e', label: 'Refus\u00e9e', tone: 'bad' },
    { value: ST_ECARTEE, label: '\u00c9cart\u00e9e', tone: 'low' }
  ];

  /**
   * Estos dos salen de la tabla sin borrarse: la fila sigue en la hoja y el
   * boton de filtro la vuelve a mostrar. Una oferta descartada no se pierde.
   */
  var STATUTS_CACHES = ['Refus\u00e9e', ST_ECARTEE];

  /** Estados que cuentan como "ya enviada". */
  var STATUTS_ENVOYES = ['Envoy\u00e9e', 'Relance faite', 'R\u00e9ponse re\u00e7ue', 'Entretien',
                         'Accept\u00e9e', 'Sans r\u00e9ponse', 'Refus\u00e9e'];

  var CONTRATS = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'CDI', label: 'CDI', tone: 'good' },
    { value: 'CDD', label: 'CDD', tone: 'mid' },
    { value: 'Alternance', label: 'Alternance', tone: 'mid' },
    { value: 'Int\u00e9rim', label: 'Int\u00e9rim', tone: 'mid' },
    { value: 'Stage', label: 'Stage', tone: 'low' },
    { value: 'Freelance', label: 'Freelance', tone: 'mid' }
  ];

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

  /** Clave del grupo de la seccion 4 para preguntas sin candidatura. */
  var ORPHAN_Q = '__sans-candidature__';

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
    contacts: [],

    // Las otras dos busquedas
    sites: [],
    criteria: [],
    vehModels: [],
    checks: [],
    vehOffers: [],
    homeOffers: [],
    inspections: []
  };

  var openAppId = null;   // candidatura abierta en la ficha
  var openQGroups = {};   // seccion 4: id de candidatura -> grupo desplegado
  var showHidden = false; // seccion 4: mostrar tambien las refusees/ecartees
  var openFolds = {};     // ficha: pliegues abiertos (lettre, respuestas)
  var map = null;         // Leaflet de la ficha, solo mientras esta abierta
  var marker = null;

  var coMap = null;       // Leaflet de la seccion Entreprises, permanente
  var coMarkers = {};     // id de empresa -> marcador
  var coFitKey = '';      // para no recentrar el mapa en cada tecleo
  var coHl = null;        // empresa resaltada al pasar por su fila
  var coSel = null;       // empresa elegida en la tabla: el mapa la ensena
  var coQuery = '';       // buscador de la seccion Entreprises
  var coPage = 0;
  var trackPages = {};    // seccion 4: id de tipo de puesto -> pagina abierta
  var PAGE_SIZE = 10;

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

    api(op.action, op.payload).then(function (data) {
      warnIfFieldsDropped(op, data);
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

  /**
   * Detecta una hoja que sigue corriendo con un Code.gs anterior a esta
   * pagina: la fila que devuelve no lleva las columnas que aun no existen
   * alli, asi que lo que hemos escrito en esos campos se ha perdido. Pasaba
   * en silencio -la peticion responde ok- y con el indicador en \u00abEnregistr\u00e9\u00bb.
   */
  var droppedWarned = {};

  function warnIfFieldsDropped(op, data) {
    if (!data || !data.row || op.action.indexOf('upsert') !== 0) return;

    var lost = Object.keys(op.payload).filter(function (k) {
      var v = op.payload[k];
      return !(k in data.row) && String(v == null ? '' : v).trim() !== '';
    });
    if (!lost.length) return;

    lost.forEach(function (k) { droppedWarned[k] = true; });
    showBanner('stale-backend', 'Ta feuille n\u2019a pas enregistr\u00e9 ' +
      Object.keys(droppedWarned).join(', ') + ' : le fichier Code.gs d\u00e9ploy\u00e9 est plus ancien ' +
      'que cette page. Dans Apps Script : collez le Code.gs \u00e0 jour, puis D\u00e9ployer \u2192 ' +
      'G\u00e9rer les d\u00e9ploiements \u2192 crayon \u2192 Version : Nouvelle version \u2192 D\u00e9ployer. ' +
      'Enregistrer le code ne suffit pas. Le reste de tes donn\u00e9es est bien enregistr\u00e9.');
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
      state.sites = data.sites || [];
      state.criteria = data.criteria || [];
      state.vehModels = data.vehModels || [];
      state.checks = data.checks || [];
      state.vehOffers = data.vehOffers || [];
      state.homeOffers = data.homeOffers || [];
      state.inspections = data.inspections || [];
      coSel = null; coQuery = ''; coPage = 0; trackPages = {};
      $('companies-search').value = '';
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
    $('pitch').value = state.profile.presentation || '';
    renderVehicule();
    renderLogement();
    // La pestana se recuerda: al recargar se vuelve donde estabas.
    var saved = 'emploi';
    try { saved = localStorage.getItem(LS_TAB) || 'emploi'; } catch (e) {}
    showTab(saved);
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

  // ---------------------------------------------------------- paginacion

  /** Recorta una lista a una pagina. Una pagina fuera de rango se ajusta. */
  function pageOf(rows, page) {
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(Math.max(0, page || 0), pages - 1);
    return { rows: rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), page: page, pages: pages };
  }

  /** attr lleva el numero de pagina a la que va cada boton. Vacio si sobra. */
  function pagerHtml(p, attr) {
    if (p.pages <= 1) return '';
    return '<button class="btn btn--sm" type="button" ' + attr + '="' + (p.page - 1) + '"' +
        (p.page === 0 ? ' disabled' : '') + ' aria-label="Page pr\u00e9c\u00e9dente">\u2039 Pr\u00e9c.</button>' +
      '<span class="count-hint">Page ' + (p.page + 1) + ' / ' + p.pages + '</span>' +
      '<button class="btn btn--sm" type="button" ' + attr + '="' + (p.page + 1) + '"' +
        (p.page === p.pages - 1 ? ' disabled' : '') + ' aria-label="Page suivante">Suiv. \u203a</button>';
  }

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

  /** Por orden alfabetico; las que aun no tienen nombre, delante. */
  function sortedCompanies() {
    return state.companies.slice().sort(function (a, b) {
      return String(a.name || '').trim().localeCompare(String(b.name || '').trim(), 'fr',
        { sensitivity: 'base', numeric: true }) ||
        Number(a.position || 0) - Number(b.position || 0);
    });
  }

  function matchesCompany(c, q) {
    if (!q) return true;
    return [c.name, c.description, c.ubicacion, c.email].some(function (v) {
      return normKey(v).indexOf(q) >= 0;
    });
  }

  function visibleCompanies() {
    var q = normKey(coQuery);
    return sortedCompanies().filter(function (c) { return matchesCompany(c, q); });
  }

  function renderCompanies() {
    var body = $('companies-body');
    var list = visibleCompanies();
    var p = pageOf(list, coPage);
    coPage = p.page;

    if (!state.companies.length) {
      body.innerHTML = '<tr><td colspan="7" data-label=""><p class="empty" style="margin:10px">' +
        'Ajoute une entreprise : son nom servira \u00e0 l\u2019autocompl\u00e9tion du suivi, et son ' +
        'adresse au lieu par d\u00e9faut de tes candidatures.</p></td></tr>';
    } else if (!list.length) {
      body.innerHTML = '<tr><td colspan="7" data-label=""><p class="empty" style="margin:10px">' +
        'Aucune entreprise ne correspond \u00e0 \u00ab ' + esc(coQuery.trim()) + ' \u00bb.</p></td></tr>';
    } else {
      body.innerHTML = p.rows.map(function (c) {
        var used = state.applications.filter(function (a) {
          return sameName(a.empresa, c.name);
        }).length;
        return '<tr data-coid="' + esc(c.id) + '"' + (c.id === coSel ? ' class="is-sel"' : '') + '>' +
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
          '<td data-label="Note">' + selectHtml(NOTES, c.nota, 'nota', ' data-cosel="1"') + '</td>' +
          '<td data-label="Email"><input class="cell-input" type="email" data-cofield="email" value="' +
            esc(c.email) + '" placeholder="contact@\u2026" spellcheck="false" autocomplete="off"></td>' +
          '<td data-label="Contact\u00e9e" class="co-check-cell"><input type="checkbox" class="co-check" ' +
            'data-cocheck="contactado"' + (c.contactado === 'si' ? ' checked' : '') +
            ' aria-label="D\u00e9j\u00e0 contact\u00e9e"></td>' +
          '<td class="cell-actions"><button class="row-del" type="button" data-co-del="1" ' +
            'aria-label="Retirer cette entreprise">\u00d7</button></td>' +
        '</tr>';
      }).join('');
    }

    $('companies-pager').innerHTML = pagerHtml(p, 'data-co-page');
    updateCompaniesCount(list.length);
    $('btn-export-companies').disabled = !state.companies.length;

    updateCompanyDatalist();
    autoGrowAll(body);
    initCompaniesMap();
    syncCompanyMarkers();
    coHl = null;   // la fila resaltada ya no existe tras reconstruir la tabla
    if (coSel) paintCompany(coSel);
  }

  function updateCompaniesCount(shown) {
    var n = state.companies.length;
    var placed = state.companies.filter(hasPoint).length;
    var done = state.companies.filter(function (c) { return c.contactado === 'si'; }).length;
    $('companies-count').textContent = n
      ? (coQuery.trim() ? shown + ' sur ' : '') +
        n + (n === 1 ? ' entreprise' : ' entreprises') +
        ' \u00b7 ' + placed + ' sur la carte \u00b7 ' + done +
        (done === 1 ? ' contact\u00e9e' : ' contact\u00e9es')
      : '';
  }

  /**
   * Resalta el pin de una empresa mientras el raton (o el foco) esta en su
   * fila. Se guarda cual esta resaltada para no repintar en cada mousemove.
   */
  function highlightCompany(id) {
    if (coHl === id) return;
    var prev = coHl;
    coHl = id;
    if (prev) paintCompany(prev);
    if (id) paintCompany(id);
  }

  /** Pinta fila y pin segun esten resaltados (coHl) o elegidos (coSel). */
  function paintCompany(id) {
    var on = id === coHl || id === coSel;
    var tr = $('companies-body').querySelector('tr[data-coid="' + cssEsc(id) + '"]');
    if (tr) {
      tr.classList.toggle('is-hl', id === coHl);
      tr.classList.toggle('is-sel', id === coSel);
    }

    var mk = coMarkers[id];
    if (!mk) return;
    // Por delante de los demas mientras esta resaltado.
    if (mk.setZIndexOffset) mk.setZIndexOffset(on ? 1000 : 0);
    var el = mk.getElement && mk.getElement();
    if (el) el.classList.toggle('marker-hl', on);
    if (on) { if (mk.openTooltip) mk.openTooltip(); }
    else if (mk.closeTooltip) mk.closeTooltip();
  }

  /** Elegir una empresa en la tabla centra el mapa en ella. */
  function selectCompany(id) {
    if (!id || id === coSel) return;
    var prev = coSel;
    coSel = id;
    if (prev) paintCompany(prev);
    paintCompany(id);

    var c = byId(state.companies, id);
    var hint = $('companies-map-hint');
    if (!c) return;
    if (!hasPoint(c)) {
      hint.textContent = companyLabel(c) + ' n\u2019est pas encore sur la carte : \u00e9cris son ' +
        'adresse puis clique sur \u00ab Chercher \u00bb.';
      return;
    }
    if (coMap) coMap.setView([Number(c.lat), Number(c.lon)], Math.max(coMap.getZoom ? coMap.getZoom() : 0, 15));
    hint.textContent = companyLabel(c) + (c.ubicacion ? ' \u00b7 ' + c.ubicacion : '');
  }

  /**
   * Lleva la tabla a la pagina donde esta una empresa (quitando la busqueda
   * si la esconde) y la elige. Lo usan el boton de anadir y los pines.
   */
  function revealCompany(id) {
    var c = byId(state.companies, id);
    if (!c) return;
    if (!matchesCompany(c, normKey(coQuery))) {
      coQuery = '';
      $('companies-search').value = '';
    }
    var idx = visibleCompanies().indexOf(c);
    coPage = Math.floor(Math.max(0, idx) / PAGE_SIZE);
    coSel = null;
    renderCompanies();
    selectCompany(id);
    var tr = $('companies-body').querySelector('tr[data-coid="' + cssEsc(id) + '"]');
    if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  // Mismo efecto con el teclado, y en el movil, donde no hay raton. Entrar en
  // una fila la elige: el mapa de debajo se centra en ella.
  $('companies-body').addEventListener('focusin', function (e) {
    highlightCompany(rowCompanyId(e.target));
    selectCompany(rowCompanyId(e.target));
  });
  $('companies-body').addEventListener('focusout', function (e) {
    var tr = e.target.closest && e.target.closest('tr[data-coid]');
    if (tr && e.relatedTarget && tr.contains(e.relatedTarget)) return;
    highlightCompany(null);
  });

  $('companies-search').addEventListener('input', function (e) {
    coQuery = e.target.value;
    coPage = 0;
    renderCompanies();
  });

  $('companies-pager').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-co-page]');
    if (!btn || btn.disabled) return;
    coPage = Number(btn.getAttribute('data-co-page'));
    renderCompanies();
  });

  $('btn-export-companies').addEventListener('click', exportCompanies);

  /**
   * Toda la tabla en CSV, sin filtro ni paginacion. Punto y coma y BOM: asi
   * Excel en frances lo abre con las columnas y los acentos bien.
   */
  function exportCompanies() {
    if (!state.companies.length) return;
    var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var head = ['Nom', 'Description', 'Adresse', 'Latitude', 'Longitude', 'Note /10', 'Email',
                'Contact\u00e9e', 'Candidatures'];
    var lines = [head.map(cell).join(';')].concat(sortedCompanies().map(function (c) {
      var used = state.applications.filter(function (a) { return sameName(a.empresa, c.name); }).length;
      return [c.name, c.description, c.ubicacion, c.lat, c.lon, c.nota, c.email,
              c.contactado === 'si' ? 'oui' : 'non', used].map(cell).join(';');
    }));
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'entreprises-' + normKey(state.profile && state.profile.name).replace(/[^a-z0-9]+/g, '-') +
      '-' + today() + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

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
      mk.on('click', function () { revealCompany(c.id); });
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

  $('companies-body').addEventListener('change', function (e) {
    var row = byId(state.companies, rowCompanyId(e.target));
    if (!row) return;
    if (e.target.getAttribute('data-cosel')) {
      row.nota = e.target.value;
      e.target.setAttribute('data-tone', toneOf(NOTES, e.target.value));
    } else if (e.target.getAttribute('data-cocheck')) {
      row.contactado = e.target.checked ? 'si' : '';
      updateCompaniesCount(visibleCompanies().length);
    } else return;
    enqueue('company:' + row.id, 'upsertCompany', row);
  });

  $('companies-body').addEventListener('click', function (e) {
    // Un clic en cualquier parte de la fila la elige, no solo en un campo.
    selectCompany(rowCompanyId(e.target));

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
    if (coSel === id) coSel = null;
    coFitKey = '';
    renderCompanies();
  });

  $('btn-add-company').addEventListener('click', function () {
    var row = {
      id: uid(), profileId: state.profileId, position: nextPosition(state.companies),
      name: '', description: '', ubicacion: '', lat: '', lon: '',
      nota: '', email: '', contactado: ''
    };
    state.companies.push(row);
    enqueue('company:' + row.id, 'upsertCompany', row);
    // Sin nombre se ordena delante: revealCompany la busca en su pagina.
    revealCompany(row.id);
    var input = $('companies-body').querySelector('tr[data-coid="' + cssEsc(row.id) + '"] [data-cofield="name"]');
    if (input) input.focus();
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

  /** Refusee o ecartee: fuera de la tabla mientras el filtro este apagado. */
  function isHidden(app) {
    return STATUTS_CACHES.indexOf(app.estado) >= 0;
  }

  function visibleApps(rows) {
    return showHidden ? rows : rows.filter(function (a) { return !isHidden(a); });
  }

  /** La barra de la seccion 4: buscar con IA y revelar lo que esta oculto. */
  function renderTrackingBar() {
    var hidden = state.applications.filter(isHidden).length;
    var pending = state.applications.filter(function (a) {
      return a.estado === ST_A_VALIDER;
    }).length;

    $('tracking-bar').innerHTML =
      '<button class="btn btn--primary btn--sm" type="button" data-ai-open="1">' +
        '\u2728 Chercher avec l\u2019IA</button>' +
      (pending ? '<span class="pill pill--ai">' + pending + ' \u00e0 valider</span>' : '') +
      '<span class="topbar-spacer"></span>' +
      (hidden
        ? '<button class="btn btn--ghost btn--sm" type="button" data-toggle-hidden="1" ' +
            'title="Les candidatures refus\u00e9es et les offres \u00e9cart\u00e9es restent dans ta feuille, ' +
            'elles sont juste masqu\u00e9es ici.">' +
            (showHidden ? 'Masquer' : 'Afficher') + ' les ' + hidden + ' offre' +
            (hidden === 1 ? '' : 's') + ' masqu\u00e9e' + (hidden === 1 ? '' : 's') +
          '</button>'
        : '');
  }

  $('tracking-bar').addEventListener('click', function (e) {
    if (e.target.getAttribute('data-ai-open')) return openAiModal();
    if (e.target.getAttribute('data-toggle-hidden')) {
      showHidden = !showHidden;
      renderTracking();
    }
  });

  function renderTracking() {
    var box = $('tracking');
    renderTrackingBar();

    if (!state.jobTypes.length) {
      box.innerHTML = '<p class="empty">Ajoute un type de poste plus haut et son tableau de suivi ' +
        'appara\u00eetra ici.</p>';
      renderStats();
      return;
    }

    box.innerHTML = state.jobTypes.map(function (jt, i) {
      var all = state.applications.filter(function (a) { return a.jobTypeId === jt.id; });
      var rows = visibleApps(all);
      var oculto = all.length - rows.length;
      var p = pageOf(rows, trackPages[jt.id]);
      trackPages[jt.id] = p.page;
      return '<section data-jt="' + esc(jt.id) + '">' +
        '<h3 class="subsection"><span data-jt-title>' + esc(jobTypeLabel(jt, i)) + '</span>' +
          '<span class="count-hint" data-jt-count>' + countLabel(rows) +
            (oculto ? (rows.length ? ' \u00b7 ' : '') + oculto + ' masqu\u00e9e' +
              (oculto === 1 ? '' : 's') : '') + '</span></h3>' +
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
          '<tbody>' + (rows.length ? p.rows.map(applicationHtml).join('')
            : '<tr><td colspan="8" data-label=""><p class="empty" style="margin:10px">' +
              (oculto ? 'Rien \u00e0 afficher : ' + oculto + ' offre' + (oculto === 1 ? '' : 's') +
                ' masqu\u00e9e' + (oculto === 1 ? '' : 's') + ' au-dessus.'
                      : 'Aucune candidature pour l\u2019instant.') + '</p></td></tr>') +
          '</tbody>' +
        '</table></div>' +
        '<div class="pager">' + pagerHtml(p, 'data-jt-page') + '</div>' +
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

    var mark = a.estado === ST_A_VALIDER ? ' class="is-avalider"'
             : (isHidden(a) ? ' class="is-masquee"' : '');

    return '<tr data-id="' + esc(a.id) + '"' + mark + '>' +
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
      enqueue('app:' + row.id, 'upsertApplication', row);
      // Si el estado nuevo esta oculto, la fila desaparece de la tabla ahora
      // mismo: dejarla a la vista hasta el siguiente repintado confunde.
      if (isHidden(row) && !showHidden) { renderTracking(); return; }
      e.target.setAttribute('data-tone', toneOf(STATUTS, e.target.value));
      tr.className = row.estado === ST_A_VALIDER ? 'is-avalider' : (isHidden(row) ? 'is-masquee' : '');
      refreshCounts(tr.closest('section[data-jt]'));
      renderStats();
      return;
    }
    if (field === 'nota') e.target.setAttribute('data-tone', toneOf(NOTES, e.target.value));
    enqueue('app:' + row.id, 'upsertApplication', row);
  });

  $('tracking').addEventListener('click', function (e) {
    var addFor = e.target.getAttribute('data-add-app');
    if (addFor) return addApplication(addFor);

    var pageBtn = e.target.closest('[data-jt-page]');
    if (pageBtn) {
      if (pageBtn.disabled) return;
      trackPages[pageBtn.closest('section[data-jt]').getAttribute('data-jt')] =
        Number(pageBtn.getAttribute('data-jt-page'));
      return renderTracking();
    }

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
      ubicacion: '', lat: '', lon: '', notaComentario: '', cartaMotivacion: '',
      contrato: ''
    };
    state.applications.push(row);
    enqueue('app:' + row.id, 'upsertApplication', row);
    // La nueva va al final: se abre la ultima pagina (pageOf la ajusta).
    trackPages[jobTypeId] = Infinity;
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
    if (!el) return;
    var all = state.applications.filter(function (a) { return a.jobTypeId === id; });
    var rows = visibleApps(all);
    var oculto = all.length - rows.length;
    el.textContent = countLabel(rows) +
      (oculto ? (rows.length ? ' \u00b7 ' : '') + oculto + ' masqu\u00e9e' + (oculto === 1 ? '' : 's') : '');
  }

  function renderStats() {
    // Las refusees/ecartees no cuentan en las cifras: si no, "candidatures"
    // sube cada vez que se descarta una oferta de la IA.
    var todas = state.applications;
    var all = todas.filter(function (a) { return !isHidden(a); });
    var envoyees = all.filter(function (a) { return STATUTS_ENVOYES.indexOf(a.estado) >= 0; }).length;
    var entretiens = all.filter(function (a) {
      return a.estado === 'Entretien' || a.estado === 'Accept\u00e9e';
    }).length;
    var aEnvoyer = all.filter(function (a) { return !a.estado; }).length;
    var aValider = all.filter(function (a) { return a.estado === ST_A_VALIDER; }).length;

    var cards = [
      { value: all.length, label: all.length === 1 ? 'candidature' : 'candidatures' },
      { value: envoyees, label: 'd\u00e9j\u00e0 envoy\u00e9es' },
      { value: entretiens, label: entretiens === 1 ? 'entretien' : 'entretiens' },
      { value: aEnvoyer, label: '\u00e0 envoyer' }
    ];
    if (aValider) cards.push({ value: aValider, label: '\u00e0 valider' });

    $('stats').innerHTML = todas.length ? cards.map(function (c) {
      return '<div class="stat"><div class="stat-value">' + c.value + '</div>' +
             '<div class="stat-label">' + esc(c.label) + '</div></div>';
    }).join('') : '';
  }

  // ------------------------------------------- 4. questions d'entretien

  // El texto para presentarse vive en la fila del perfil, no en una tabla.
  $('pitch').addEventListener('input', function (e) {
    state.profile.presentation = e.target.value;
    enqueue('presentation:' + state.profileId, 'upsertPresentation',
      { id: state.profileId, presentation: e.target.value });
  });

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

    // Un grupo por candidatura (la empresa da el titulo), en el orden de las
    // candidaturas. Las huerfanas -candidatura borrada- caen en el ultimo grupo.
    var groups = [];
    var byApp = {};
    function groupFor(key, app) {
      if (!byApp[key]) { byApp[key] = { key: key, app: app, rows: [] }; groups.push(byApp[key]); }
      return byApp[key];
    }
    state.applications.forEach(function (a) { groupFor(a.id, a); });
    state.questions.forEach(function (q) {
      var app = byId(state.applications, q.applicationId);
      groupFor(app ? app.id : ORPHAN_Q, app).rows.push(q);
    });

    var html = groups.filter(function (g) { return g.rows.length; }).map(function (g) {
      g.rows.sort(function (x, y) { return Number(x.position || 0) - Number(y.position || 0); });
      var aRevoir = g.rows.filter(function (q) { return q.answered !== 'oui'; }).length;

      return '<details class="qgroup" data-qgroup="' + esc(g.key) + '"' +
          (openQGroups[g.key] ? ' open' : '') + '>' +
        '<summary class="qgroup-head">' +
          '<span class="qgroup-name" data-qgroup-name>' +
            esc(g.app ? appLabel(g.app) : 'Candidature supprim\u00e9e') + '</span>' +
          (g.app && g.app.puesto ? '<span class="qgroup-poste">' + esc(g.app.puesto) + '</span>' : '') +
          '<span class="qgroup-meta">' + g.rows.length +
            (g.rows.length === 1 ? ' question' : ' questions') +
            (aRevoir ? ' \u00b7 <strong>' + aRevoir + ' \u00e0 revoir</strong>' : '') + '</span>' +
          (g.app ? '<button class="link-btn qgroup-fiche" type="button" data-open-app="' +
            esc(g.app.id) + '">Fiche</button>' : '') +
        '</summary>' +
        '<div class="table-wrap"><table class="grid">' +
        '<thead><tr>' +
          '<th style="width:34%">Question pos\u00e9e</th>' +
          '<th style="width:13%">Su r\u00e9pondre ?</th>' +
          '<th style="width:53%">R\u00e9ponse \u00e0 donner la prochaine fois</th>' +
          '<th style="width:44px"><span class="sr-only">Actions</span></th>' +
        '</tr></thead><tbody>' +
        g.rows.map(function (q) {
          return '<tr data-qid="' + esc(q.id) + '">' +
            '<td data-label="Question pos\u00e9e"><textarea class="cell-input" data-qfield="question" rows="1" ' +
              'placeholder="La question">' + esc(q.question) + '</textarea></td>' +
            '<td data-label="Su r\u00e9pondre ?">' + selectHtml(REPONDU, q.answered, 'answered', ' data-qsel="1"') + '</td>' +
            '<td data-label="R\u00e9ponse \u00e0 donner"><textarea class="cell-input" data-qfield="answer" rows="1" ' +
              'placeholder="Ce qu\u2019il faudrait r\u00e9pondre">' + esc(q.answer) + '</textarea></td>' +
            '<td class="cell-actions"><button class="row-del" type="button" data-qdel="1" ' +
              'aria-label="Retirer cette question">\u00d7</button></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>' +
      '</details>';
    }).join('');

    var abiertos = groups.some(function (g) { return g.rows.length && openQGroups[g.key]; });
    box.innerHTML = html +
      '<div class="table-foot">' +
        '<button class="btn btn--sm" type="button" data-q-toggle-all="1">' +
          (abiertos ? 'Tout replier' : 'Tout d\u00e9plier') + '</button>' +
        '<span class="count-hint">' + state.questions.length +
          (state.questions.length === 1 ? ' question' : ' questions') + ' au total, ' +
          'group\u00e9es par entreprise</span>' +
      '</div>';

    autoGrowAll(box);
  }

  /** El nombre de la empresa titula su grupo en la seccion 4: en vivo, sin
   *  volver a pintar (un render cerraria los grupos abiertos). */
  function refreshQuestionCompany(app) {
    var head = $('all-questions').querySelector('[data-qgroup="' + cssEsc(app.id) + '"] [data-qgroup-name]');
    if (head) head.textContent = appLabel(app);
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

  // 'toggle' no burbujea: hay que escucharlo en la fase de captura.
  $('all-questions').addEventListener('toggle', function (e) {
    var det = e.target.closest ? e.target.closest('details.qgroup') : null;
    if (!det) return;
    var key = det.getAttribute('data-qgroup');
    if (det.open) openQGroups[key] = true; else delete openQGroups[key];
    // Dentro de un grupo cerrado scrollHeight es 0: hay que medir al abrir.
    if (det.open) autoGrowAll(det);
    var btn = $('all-questions').querySelector('[data-q-toggle-all]');
    if (btn) {
      var some = !!$('all-questions').querySelector('details.qgroup[open]');
      btn.textContent = some ? 'Tout replier' : 'Tout d\u00e9plier';
    }
  }, true);

  $('all-questions').addEventListener('click', function (e) {
    var open = e.target.closest('[data-open-app]');
    if (open) {
      // El boton vive dentro del <summary>: sin esto, abrir la ficha
      // desplegaria tambien el grupo.
      e.preventDefault();
      return openDetail(open.getAttribute('data-open-app'));
    }

    if (e.target.getAttribute('data-q-toggle-all')) {
      var groups = $('all-questions').querySelectorAll('details.qgroup');
      var abrir = !$('all-questions').querySelector('details.qgroup[open]');
      Array.prototype.forEach.call(groups, function (d) { d.open = abrir; });
      return;
    }

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

  /** Que lista colorea cada select de la ficha. */
  var AF_LISTS = { nota: NOTES, modalidad: MODALITES, contrato: CONTRATS };

  function fieldBlock(label, control) {
    return '<div class="field"><label>' + esc(label) + '</label>' + control + '</div>';
  }

  /**
   * Un bloque plegable de la ficha. Se acuerda de si estaba abierto mientras
   * dure la sesion: la ficha se vuelve a pintar cada vez que se abre, y el
   * que esta escribiendo su lettre no quiere replegarla a cada vuelta.
   */
  function foldHtml(key, title, meta, body, cls) {
    return '<details class="md-fold' + (cls ? ' ' + cls : '') + '" data-fold="' + esc(key) + '"' +
        (openFolds[key] ? ' open' : '') + '>' +
      '<summary class="md-fold-head">' +
        '<span class="md-fold-title">' + esc(title) + '</span>' +
        '<span class="md-fold-meta">' + esc(meta) + '</span>' +
      '</summary>' +
      '<div class="md-fold-body">' + body + '</div>' +
    '</details>';
  }

  /** Refresca el resumen del pliegue que contiene este campo, al teclear. */
  function foldMeta(el, text) {
    var det = el.closest('details.md-fold');
    var meta = det && det.querySelector('.md-fold-meta');
    if (meta) meta.textContent = text;
  }

  /** Primeras palabras de un texto, para ver lo que hay sin desplegar. */
  function peek(value, max) {
    var v = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!v) return '';
    return v.length > max ? v.slice(0, max - 1) + '\u2026' : v;
  }

  /**
   * Cabecera de decision para las ofertas que ha traido la IA. Guardar la deja
   * como una candidatura normal; descartarla la saca de la tabla sin borrarla.
   */
  function verdictHtml(app) {
    if (app.estado === ST_A_VALIDER) {
      return '<div class="md-verdict">' +
        '<p class="md-verdict-text"><strong>Offre propos\u00e9e par l\u2019IA.</strong> ' +
          'V\u00e9rifie le lien et les infos \u2014 une IA se trompe. Puis d\u00e9cide :</p>' +
        '<div class="row-actions">' +
          '<button class="btn btn--primary btn--sm" type="button" data-app-keep="1">' +
            'Garder cette candidature</button>' +
          '<button class="btn btn--sm btn--danger" type="button" data-app-drop="1">' +
            'L\u2019\u00e9carter</button>' +
        '</div>' +
      '</div>';
    }
    if (app.estado === ST_ECARTEE) {
      return '<div class="md-verdict md-verdict--off">' +
        '<p class="md-verdict-text"><strong>Offre \u00e9cart\u00e9e.</strong> ' +
          'Elle reste dans ta feuille, mais hors du tableau.</p>' +
        '<div class="row-actions">' +
          '<button class="btn btn--sm" type="button" data-app-keep="1">' +
            'La remettre dans le tableau</button>' +
        '</div>' +
      '</div>';
    }
    return '';
  }

  function openDetail(appId) {
    var app = byId(state.applications, appId);
    if (!app) return;
    openAppId = appId;

    $('modal-title').textContent = appLabel(app);
    $('modal-sub').textContent = [app.puesto, app.fecha].filter(Boolean).join(' \u00b7 ') ||
      'Fiche de candidature';

    $('modal-body').innerHTML =
      verdictHtml(app) +
      '<section class="md-block">' +
        '<h3 class="md-h">Le poste</h3>' +
        '<div class="md-grid">' +
          fieldBlock('Fourchette de salaire', '<input class="input" data-af="sueldo" value="' + esc(app.sueldo) +
            '" placeholder="Ex. : 32-38 k\u20ac brut">') +
          fieldBlock('Type de contrat', selectHtml(CONTRATS, app.contrato, 'contrato', ' data-af-sel="contrato"')) +
          fieldBlock('Modalit\u00e9', selectHtml(MODALITES, app.modalidad, 'modalidad', ' data-af-sel="modalidad"')) +
          fieldBlock('Note globale', selectHtml(NOTES, app.nota, 'nota', ' data-af-sel="nota"')) +
          fieldBlock('Lien de l\u2019offre', '<input class="input" data-af="enlace" value="' + esc(app.enlace) +
            '" placeholder="https://\u2026" spellcheck="false">') +
        '</div>' +
        fieldBlock('Pourquoi cette note', '<textarea class="input" data-af="notaComentario" rows="2" ' +
          'placeholder="Ex. : bien pay\u00e9, mais les missions ont l\u2019air stressantes">' +
          esc(app.notaComentario) + '</textarea>') +
        fieldBlock('Missions', '<textarea class="input" data-af="misiones" rows="3" ' +
          'placeholder="Ce que le poste demande au quotidien">' + esc(app.misiones) + '</textarea>') +
        fieldBlock('Avantages', '<textarea class="input" data-af="ventajas" rows="2" ' +
          'placeholder="Ex. : tickets restaurant, 50 % transport, 2 jours de t\u00e9l\u00e9travail">' +
          esc(app.ventajas) + '</textarea>') +
      '</section>' +

      '<section class="md-block">' +
        foldHtml('lettre', 'Lettre de motivation',
          app.cartaMotivacion
            ? String(app.cartaMotivacion).length + ' caract\u00e8res'
            : 'rien pour l\u2019instant',
          '<textarea class="input md-letter" data-af="cartaMotivacion" rows="10" ' +
            'placeholder="La lettre envoy\u00e9e avec cette candidature\u2026">' +
            esc(app.cartaMotivacion) + '</textarea>') +
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
    // Se guarda al teclear, como todo lo demas: antes solo salia al pulsar
    // \u00abChercher\u00bb, y una direccion escrita y no buscada se perdia al cerrar.
    $('md-address').addEventListener('input', function () {
      var row = byId(state.applications, openAppId);
      if (!row) return;
      row.ubicacion = $('md-address').value;
      enqueue('app:' + row.id, 'upsertApplication', row);
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

  // 'toggle' no burbujea: se escucha en captura. Dentro de un pliegue cerrado
  // scrollHeight es 0, asi que hay que medir los textarea al abrirlo.
  $('modal-body').addEventListener('toggle', function (e) {
    var det = e.target.closest ? e.target.closest('details.md-fold') : null;
    if (!det) return;
    var key = det.getAttribute('data-fold');
    if (det.open) { openFolds[key] = true; autoGrowAll(det); } else delete openFolds[key];
  }, true);
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
      if (af === 'cartaMotivacion') {
        foldMeta(t, t.value ? String(t.value).length + ' caract\u00e8res' : 'rien pour l\u2019instant');
      }
      enqueue('app:' + app.id, 'upsertApplication', app);
    } else if (mq) {
      var q = byId(state.questions, t.closest('[data-qid]').getAttribute('data-qid'));
      if (!q) return;
      q[mq] = t.value; autoGrow(t);
      if (mq === 'answer') foldMeta(t, peek(t.value, 46) || '\u00e0 \u00e9crire');
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
      e.target.setAttribute('data-tone', toneOf(AF_LISTS[af] || MODALITES, e.target.value));
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
    if (e.target.getAttribute('data-app-keep') || e.target.getAttribute('data-app-drop')) {
      var app = byId(state.applications, openAppId);
      if (!app) return;
      app.estado = e.target.getAttribute('data-app-drop') ? ST_ECARTEE : '';
      enqueue('app:' + app.id, 'upsertApplication', app);
      closeDetail();   // closeDetail repinta la tabla y las questions
      return;
    }
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
          foldHtml('answer:' + q.id, 'R\u00e9ponse \u00e0 donner',
            peek(q.answer, 46) || '\u00e0 \u00e9crire',
            '<textarea class="input md-answer" data-mq="answer" rows="1" ' +
              'placeholder="R\u00e9ponse \u00e0 donner la prochaine fois">' + esc(q.answer) + '</textarea>',
            'md-fold--sm') +
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
  //  Recherche assistee par IA
  //  El usuario genera un prompt aqui, lo pega en su IA (otra ventana), y
  //  trae de vuelta el JSON. Esta pagina no habla con ninguna IA: no hay
  //  clave de API que guardar ni nada que se escape sin querer.
  // =====================================================================

  var AI_FIELDS = ['links', 'extra', 'ville', 'rayon', 'salaire', 'contrat',
                   'teletravail', 'jours', 'max'];

  /** Estos dos son casillas: varias respuestas, guardadas separadas por comas. */
  var AI_MULTI = ['contrat', 'teletravail'];

  var AI_DEFAULTS = {
    links: '', extra: '', ville: 'Strasbourg', rayon: '30', salaire: '',
    contrat: '', teletravail: '', jours: '30', max: '10'
  };

  function isAiMulti(field) { return AI_MULTI.indexOf(field) >= 0; }

  /** Lee/escribe un grupo de casillas como una lista en texto. */
  function aiMultiValue(field) {
    var out = [];
    var boxes = $('ai-' + field).querySelectorAll('input[type="checkbox"]');
    Array.prototype.forEach.call(boxes, function (b) {
      if (b.checked) out.push(b.value);
    });
    return out.join(', ');
  }

  function setAiMultiValue(field, value) {
    var wanted = String(value || '').split(',').map(function (v) {
      return normKey(v);
    }).filter(Boolean);
    var boxes = $('ai-' + field).querySelectorAll('input[type="checkbox"]');
    Array.prototype.forEach.call(boxes, function (b) {
      b.checked = wanted.indexOf(normKey(b.value)) >= 0;
      b.closest('.chip').classList.toggle('is-on', b.checked);
    });
  }

  /** Los criterios se quedan en el aparato, como la clave de la hoja. */
  function aiPrefsKey() { return 'estrasburgo.aiSearch.' + state.profileId; }

  function readAiPrefs() {
    var out = {};
    AI_FIELDS.forEach(function (f) { out[f] = AI_DEFAULTS[f]; });
    try {
      var raw = JSON.parse(localStorage.getItem(aiPrefsKey()) || '{}');
      AI_FIELDS.forEach(function (f) {
        if (typeof raw[f] === 'string') out[f] = raw[f];
      });
    } catch (e) { /* preferencias ilegibles: se usan las de serie */ }
    return out;
  }

  function formAiPrefs() {
    var out = {};
    AI_FIELDS.forEach(function (f) {
      out[f] = isAiMulti(f) ? aiMultiValue(f) : $('ai-' + f).value;
    });
    return out;
  }

  function saveAiPrefs() {
    try { localStorage.setItem(aiPrefsKey(), JSON.stringify(formAiPrefs())); } catch (e) {}
  }

  // --- IA: funciones puras. Las pruebas las extraen entre estas dos marcas.

  /** Clave para comparar textos escritos por humanos o por una IA. */
  function normKey(s) {
    var v = String(s == null ? '' : s).trim().toLowerCase();
    if (v.normalize) v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return v.replace(/\s+/g, ' ');
  }

  function txt(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v.trim();
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return v.map(txt).filter(Boolean).join(' \u00b7 ');
    }
    return '';
  }

  function arr(v) {
    return Object.prototype.toString.call(v) === '[object Array]' ? v : (v ? [v] : []);
  }

  /** Igual con el tipo de contrato: la IA lo escribe como quiere. */
  function normContrat(value) {
    var v = normKey(value);
    if (!v) return '';
    if (v.indexOf('cdi') >= 0 || v.indexOf('indetermin') >= 0) return 'CDI';
    if (v.indexOf('altern') >= 0 || v.indexOf('apprenti') >= 0 ||
        v.indexOf('professionnalisation') >= 0) return 'Alternance';
    if (v.indexOf('interim') >= 0 || v.indexOf('mission') >= 0 ||
        v.indexOf('temporaire') >= 0) return 'Int\u00e9rim';
    if (v.indexOf('stage') >= 0 || v.indexOf('intern') >= 0) return 'Stage';
    if (v.indexOf('freelance') >= 0 || v.indexOf('independant') >= 0 ||
        v.indexOf('portage') >= 0) return 'Freelance';
    if (v.indexOf('cdd') >= 0 || v.indexOf('determin') >= 0) return 'CDD';
    return '';
  }

  /** La IA escribe la modalidad a su manera: la traemos a la lista cerrada. */
  function normModalite(value) {
    var v = normKey(value);
    if (!v) return '';
    if (v.indexOf('hybrid') >= 0 || v.indexOf('partiel') >= 0) return 'Hybride';
    if (v.indexOf('teletravail') >= 0 || v.indexOf('remote') >= 0 ||
        v.indexOf('distance') >= 0 || v.indexOf('full remote') >= 0) return 'T\u00e9l\u00e9travail';
    if (v.indexOf('presentiel') >= 0 || v.indexOf('sur place') >= 0 ||
        v.indexOf('sur site') >= 0 || v.indexOf('bureau') >= 0) return 'Pr\u00e9sentiel';
    return '';
  }

  /** La nota tiene que caer en la lista de 0 a 10, o quedarse vacia. */
  function normNote(value) {
    var raw = String(value == null ? '' : value).replace(',', '.').split('/')[0].trim();
    if (!raw) return '';
    var n = Math.round(Number(raw));
    return (isNaN(n) || n < 0 || n > 10) ? '' : String(n);
  }

  /** Coordenada decimal en texto, o vacio si no es un numero creible. */
  function normCoord(value) {
    var raw = String(value == null ? '' : value).trim().replace(',', '.');
    if (!raw) return '';
    var n = Number(raw);
    return (isNaN(n) || n < -180 || n > 180) ? '' : String(n);
  }

  /** Fecha ISO corta, o vacio. La IA a veces devuelve "septembre 2026". */
  function normDate(value) {
    var m = String(value == null ? '' : value).match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  }

  /**
   * El texto que el usuario copia y pega en su IA. Lleva su perfil, sus tipos
   * de puesto, sus criterios, lo que ya tiene apuntado (para que no se lo
   * proponga otra vez) y el formato exacto de la respuesta.
   */
  /** Una lista escrita con comas -> sus valores. \u00abPeu importe\u00bb = sin filtro. */
  function choices(value) {
    return String(value == null ? '' : value).split(',').map(function (v) {
      return v.trim();
    }).filter(function (v) {
      return v && normKey(v) !== 'peu importe';
    });
  }

  function buildAiPrompt(prefs, ctx) {
    var links = String(prefs.links || '').split(/[\n,;]+/).map(function (l) {
      return l.trim();
    }).filter(Boolean);

    var maxOffres = Math.max(1, Math.min(50, Math.round(Number(prefs.max) || 10)));
    var L = [];

    L.push('Tu es mon assistant de recherche d\u2019emploi. Objectif : une recherche APPROFONDIE');
    L.push('d\u2019offres r\u00e9elles et encore en ligne aujourd\u2019hui, puis une r\u00e9ponse en JSON strict.');
    L.push('Utilise la recherche web. Prends le temps de croiser plusieurs plateformes.');
    L.push('');

    L.push('## 1. Qui je suis');
    if (links.length) {
      L.push('Ouvre vraiment ces pages et sers-t\u2019en pour me profiler (parcours, comp\u00e9tences, niveau) :');
      links.forEach(function (l) { L.push('- ' + l); });
    } else {
      L.push('Je ne t\u2019ai donn\u00e9 aucun lien : profile-moi \u00e0 partir des types de poste ci-dessous.');
    }
    if (txt(prefs.extra)) {
      L.push('');
      L.push('\u00c0 savoir sur moi / pr\u00e9cisions : ' + txt(prefs.extra));
    }
    L.push('');

    L.push('## 2. Les types de poste qui m\u2019int\u00e9ressent');
    if (!ctx.jobTypes.length) {
      L.push('(aucun renseign\u00e9)');
    } else {
      ctx.jobTypes.forEach(function (jt) {
        var bits = ['\u00ab ' + (txt(jt.tipo) || 'sans titre') + ' \u00bb'];
        if (txt(jt.porQue)) bits.push('pourquoi : ' + txt(jt.porQue));
        if (txt(jt.nivelFrances)) bits.push('niveau de fran\u00e7ais attendu : ' + txt(jt.nivelFrances));
        if (txt(jt.prioridad)) bits.push('priorit\u00e9 : ' + txt(jt.prioridad));
        L.push('- ' + bits.join(' | '));
      });
    }
    L.push('');

    L.push('## 3. Mes crit\u00e8res');
    L.push('- Lieu : ' + (txt(prefs.ville) || 'Strasbourg') +
      (txt(prefs.rayon) ? ', dans un rayon d\u2019environ ' + txt(prefs.rayon) + ' km' : ''));
    if (txt(prefs.salaire)) L.push('- Salaire minimum : ' + txt(prefs.salaire) + ' \u20ac brut par an');
    var contrats = choices(prefs.contrat);
    if (contrats.length) {
      L.push('- Type de contrat : ' + contrats.join(' ou ') +
        (contrats.length > 1 ? ' (n\u2019importe lequel des ' + contrats.length + ')' : ''));
    }
    var presences = choices(prefs.teletravail);
    if (presences.length) {
      L.push('- Pr\u00e9sence sur place : ' + presences.join(' ou ') +
        (presences.length > 1 ? ' (l\u2019un ou l\u2019autre)' : ''));
    }
    if (txt(prefs.jours)) L.push('- Offres publi\u00e9es depuis moins de ' + txt(prefs.jours) + ' jours');
    L.push('- Nombre maximum d\u2019offres \u00e0 me retourner : ' + maxOffres);
    L.push('');

    L.push('## 4. O\u00f9 chercher');
    L.push('Balaye les grandes plateformes fran\u00e7aises, pas une seule : France Travail, LinkedIn,');
    L.push('Indeed, HelloWork, Welcome to the Jungle, APEC, Cadremploi, Monster, Meteojob,');
    L.push('Talent.com, Jobijoba, RegionsJob, Glassdoor, JobTeaser, les agences d\u2019int\u00e9rim');
    L.push('(Manpower, Adecco, Randstad, Synergie), les sites carri\u00e8re des entreprises de la');
    L.push('r\u00e9gion, et le secteur public (Emploi Territorial, Choisir le service public) si \u00e7a colle.');
    L.push('Pour chaque offre retenue, v\u00e9rifie qu\u2019elle est encore ouverte et garde son lien direct.');
    L.push('');

    L.push('## 5. Ce que j\u2019ai d\u00e9j\u00e0 dans mon suivi \u2014 ne me le propose pas');
    var deja = ctx.applications.filter(function (a) {
      return txt(a.empresa) || txt(a.puesto);
    });
    if (!deja.length) {
      L.push('(rien pour l\u2019instant)');
    } else {
      deja.forEach(function (a) {
        L.push('- ' + (txt(a.empresa) || '?') + ' \u2014 ' + (txt(a.puesto) || 'poste non pr\u00e9cis\u00e9') +
          (txt(a.enlace) ? ' (' + txt(a.enlace) + ')' : ''));
      });
    }
    L.push('');

    L.push('## 6. Format de ta r\u00e9ponse');
    L.push('R\u00e9ponds UNIQUEMENT avec un bloc de code JSON valide, sans une phrase avant ni');
    L.push('apr\u00e8s, et sans commentaires dans le JSON. Exactement dans cette forme');
    L.push('(les cl\u00e9s ne changent pas) :');
    L.push('');
    L.push('```json');
    L.push('{');
    L.push('  "offres": [');
    L.push('    {');
    L.push('      "typeDePoste": "reprends exactement un libell\u00e9 de la section 2",');
    L.push('      "poste": "titre exact de l\u2019offre",');
    L.push('      "lien": "https://url-directe-de-l-offre",');
    L.push('      "source": "plateforme o\u00f9 tu l\u2019as trouv\u00e9e",');
    L.push('      "datePublication": "AAAA-MM-JJ",');
    L.push('      "contrat": "CDI, CDD, Alternance, Int\u00e9rim, Stage ou Freelance",');
    L.push('      "salaire": "tel qu\u2019affich\u00e9 dans l\u2019offre, sinon vide",');
    L.push('      "modalite": "Pr\u00e9sentiel ou Hybride ou T\u00e9l\u00e9travail, sinon vide",');
    L.push('      "missions": "ce que le poste demande, en 2 ou 3 phrases",');
    L.push('      "avantages": "avantages annonc\u00e9s",');
    L.push('      "adresse": "adresse du poste si elle diff\u00e8re du si\u00e8ge",');
    L.push('      "lat": "", "lon": "",');
    L.push('      "note": "ta note de 0 \u00e0 10 sur l\u2019ad\u00e9quation avec mon profil",');
    L.push('      "pourquoiCetteNote": "une phrase : ce qui est bien, ce qui l\u2019est moins",');
    L.push('      "entreprise": {');
    L.push('        "nom": "nom de l\u2019entreprise",');
    L.push('        "description": "ce qu\u2019elle fait, taille, secteur",');
    L.push('        "adresse": "adresse postale du site concern\u00e9",');
    L.push('        "lat": "", "lon": ""');
    L.push('      },');
    L.push('      "questionsProbables": ["questions que cette entreprise risque de me poser"],');
    L.push('      "aSavoir": ["infos utiles : process de recrutement, actualit\u00e9, r\u00e9putation"],');
    L.push('      "contacts": [{ "nom": "", "role": "", "email": "", "telephone": "" }]');
    L.push('    }');
    L.push('  ]');
    L.push('}');
    L.push('```');
    L.push('');
    L.push('R\u00e8gles :');
    L.push('- N\u2019invente RIEN. Un champ que tu ne connais pas reste une cha\u00eene vide "".');
    L.push('  Pas de salaire devin\u00e9, pas de contact invent\u00e9, pas de lien reconstruit de t\u00eate.');
    L.push('- "lien" est obligatoire : une offre sans URL v\u00e9rifiable ne va pas dans la liste.');
    L.push('- "typeDePoste" doit reprendre au caract\u00e8re pr\u00e8s un des libell\u00e9s de la section 2.');
    L.push('- "modalite" : uniquement "Pr\u00e9sentiel", "Hybride", "T\u00e9l\u00e9travail" ou "".');
    L.push('- "contrat" : uniquement "CDI", "CDD", "Alternance", "Int\u00e9rim", "Stage",');
    L.push('  "Freelance" ou "".');
    L.push('- "lat"/"lon" : coordonn\u00e9es d\u00e9cimales en texte ("48.5734"), sinon "".');
    L.push('- ' + maxOffres + ' offres au maximum, les plus pertinentes d\u2019abord, sans doublon');
    L.push('  entre elles ni avec la section 5.');
    L.push('- Si tu ne trouves rien de s\u00e9rieux, renvoie "offres": [] plut\u00f4t que du remplissage.');

    return L.join('\n');
  }

  /**
   * Saca las ofertas de lo que sea que haya pegado el usuario: el objeto a
   * pelo, un bloque ```json ... ``` o el JSON con frases alrededor.
   */
  function parseAiOffers(text) {
    var raw = String(text || '').trim();
    if (!raw) return { error: 'Colle d\u2019abord la r\u00e9ponse de l\u2019IA dans le cadre.' };

    var best = '';
    raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, function (_, inner) {
      inner = String(inner).trim();
      if (inner.indexOf('{') >= 0 && inner.length > best.length) best = inner;
      return '';
    });
    if (best) {
      raw = best;
    } else if (raw.charAt(0) !== '{' && raw.charAt(0) !== '[') {
      // Hay frases delante: nos quedamos con el objeto. Solo si no empieza ya
      // por JSON, o a un array a pelo le arrancariamos los corchetes.
      var a = raw.indexOf('{');
      var b = raw.lastIndexOf('}');
      if (a >= 0 && b > a) raw = raw.slice(a, b + 1);
    }

    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { error: 'Ce n\u2019est pas du JSON valide (' + e.message + '). Redemande \u00e0 l\u2019IA ' +
        'le bloc de code JSON seul, sans texte autour.' };
    }

    var list = null;
    if (Object.prototype.toString.call(data) === '[object Array]') list = data;
    else if (data && typeof data === 'object') {
      list = data.offres || data.offers || data.candidatures || data.jobs || null;
    }
    if (Object.prototype.toString.call(list) !== '[object Array]') {
      return { error: 'Le JSON ne contient pas de liste \u00ab offres \u00bb.' };
    }
    return { offers: list };
  }

  /**
   * Convierte las ofertas de la IA en filas de la hoja. No escribe nada:
   * devuelve lo que habria que guardar y un informe de lo que descarta.
   */
  function buildImportPayload(offers, ctx) {
    if (!ctx.jobTypes.length) {
      return { error: 'Ajoute d\u2019abord un type de poste dans la section 2 : ' +
        'chaque candidature appartient \u00e0 l\u2019un d\u2019eux.' };
    }

    var out = { companies: [], applications: [], questions: [], learnings: [], contacts: [] };
    var report = { kept: [], skipped: [], warnings: [], newCompanies: [] };

    // Indices anti-duplicados: lo que ya hay en el suivi mas lo que vamos creando.
    var seenLink = {}, seenPair = {}, coByName = {};
    ctx.applications.forEach(function (a) {
      if (txt(a.enlace)) seenLink[normKey(a.enlace)] = true;
      seenPair[normKey(a.empresa) + '|' + normKey(a.puesto)] = true;
    });
    ctx.companies.forEach(function (c) { coByName[normKey(c.name)] = c; });

    function maxPos(rows) {
      return rows.reduce(function (m, r) {
        var n = Number(r.position);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
    }
    var coPos = maxPos(ctx.companies);
    var appPos = {};
    ctx.jobTypes.forEach(function (jt) {
      appPos[jt.id] = maxPos(ctx.applications.filter(function (a) {
        return a.jobTypeId === jt.id;
      }));
    });

    offers.forEach(function (raw, i) {
      var o = raw || {};
      var co = o.entreprise || o.company || {};
      var nom = txt(co.nom || co.name);
      var poste = txt(o.poste || o.titre || o.title);
      var lien = txt(o.lien || o.url || o.link);
      var label = nom || poste || 'Offre ' + (i + 1);

      if (!nom && !poste) {
        report.skipped.push({ label: 'Offre ' + (i + 1), why: 'ni entreprise ni poste' });
        return;
      }
      if (lien && seenLink[normKey(lien)]) {
        report.skipped.push({ label: label, why: 'ce lien est d\u00e9j\u00e0 dans ton suivi' });
        return;
      }
      var pair = normKey(nom) + '|' + normKey(poste);
      if (seenPair[pair]) {
        report.skipped.push({ label: label, why: 'd\u00e9j\u00e0 dans ton suivi' });
        return;
      }
      seenPair[pair] = true;
      if (lien) seenLink[normKey(lien)] = true;

      // Tipo de puesto: por nombre exacto, luego por parecido, y si no el primero.
      var wanted = normKey(o.typeDePoste || o.type || '');
      var jt = null;
      if (wanted) {
        ctx.jobTypes.forEach(function (t) {
          if (!jt && normKey(t.tipo) === wanted) jt = t;
        });
        if (!jt) {
          ctx.jobTypes.forEach(function (t) {
            var k = normKey(t.tipo);
            if (!jt && k && (k.indexOf(wanted) >= 0 || wanted.indexOf(k) >= 0)) jt = t;
          });
        }
      }
      if (!jt) {
        jt = ctx.jobTypes[0];
        report.warnings.push(label + ' : type de poste ' +
          (wanted ? '\u00ab ' + txt(o.typeDePoste) + ' \u00bb inconnu' : 'non pr\u00e9cis\u00e9') +
          ', rang\u00e9e dans \u00ab ' + (txt(jt.tipo) || 'le premier type') + ' \u00bb');
      }

      if (nom && !coByName[normKey(nom)]) {
        coPos += 10;
        var coRow = {
          id: ctx.uid(), profileId: ctx.profileId, position: coPos, name: nom,
          description: txt(co.description),
          ubicacion: txt(co.adresse || co.ubicacion),
          lat: normCoord(co.lat), lon: normCoord(co.lon),
          nota: '', email: '', contactado: ''
        };
        out.companies.push(coRow);
        coByName[normKey(nom)] = coRow;
        report.newCompanies.push(nom);
      }

      var appId = ctx.uid();
      appPos[jt.id] = (appPos[jt.id] || 0) + 10;
      out.applications.push({
        id: appId, profileId: ctx.profileId, jobTypeId: jt.id, position: appPos[jt.id],
        fecha: ctx.today, empresa: nom, puesto: poste,
        fuente: txt(o.source || o.plateforme || o.platform),
        estado: ST_A_VALIDER, proximaAccion: '', enlace: lien,
        nota: normNote(o.note), misiones: txt(o.missions || o.missiones),
        sueldo: txt(o.salaire), modalidad: normModalite(o.modalite),
        ventajas: txt(o.avantages), ubicacion: txt(o.adresse || o.lieu),
        lat: normCoord(o.lat), lon: normCoord(o.lon),
        notaComentario: txt(o.pourquoiCetteNote), cartaMotivacion: '',
        contrato: normContrat(o.contrat || o.typeDeContrat)
      });

      arr(o.questionsProbables || o.questions).forEach(function (q, k) {
        var pregunta = txt(q && q.question ? q.question : q);
        if (!pregunta) return;
        out.questions.push({
          id: ctx.uid(), profileId: ctx.profileId, applicationId: appId,
          position: (k + 1) * 10, question: pregunta, answered: '',
          answer: txt(q && q.answer)
        });
      });

      var infos = arr(o.aSavoir || o.infos).map(txt).filter(Boolean);
      var pub = normDate(o.datePublication);
      var src = txt(o.source || o.plateforme);
      if (pub || src) {
        infos.unshift('Offre trouv\u00e9e par l\u2019IA' + (src ? ' sur ' + src : '') +
          (pub ? ', publi\u00e9e le ' + pub : '') + '.');
      }
      infos.forEach(function (info, k) {
        out.learnings.push({
          id: ctx.uid(), profileId: ctx.profileId, applicationId: appId,
          position: (k + 1) * 10, note: info
        });
      });

      arr(o.contacts).forEach(function (c, k) {
        c = c || {};
        var row = {
          id: ctx.uid(), profileId: ctx.profileId, applicationId: appId,
          position: (k + 1) * 10, name: txt(c.nom || c.name), role: txt(c.role || c.poste),
          email: txt(c.email), phone: txt(c.telephone || c.phone)
        };
        if (row.name || row.role || row.email || row.phone) out.contacts.push(row);
      });

      report.kept.push({ label: label, poste: poste, jobType: txt(jt.tipo) });
    });

    return { payload: out, report: report };
  }

  // --- fin de las funciones puras de la IA

  function aiCtx() {
    return {
      profileId: state.profileId,
      jobTypes: state.jobTypes,
      applications: state.applications,
      companies: state.companies,
      today: today(),
      uid: uid
    };
  }

  function openAiModal() {
    var prefs = readAiPrefs();
    AI_FIELDS.forEach(function (f) {
      if (isAiMulti(f)) setAiMultiValue(f, prefs[f]);
      else $('ai-' + f).value = prefs[f];
    });
    $('ai-prompt').value = '';
    $('ai-report').innerHTML = '';
    $('ai-copy-state').textContent = '';
    $('ai-foot-hint').textContent = '';
    hideBanner('ai-error');

    var sinTipos = !state.jobTypes.length;
    if (sinTipos) {
      showBanner('ai-error', 'Ajoute d\u2019abord au moins un type de poste dans la section 2 : ' +
        'c\u2019est ce qui dit \u00e0 l\u2019IA quoi chercher, et c\u2019est l\u00e0 que les offres viendront se ranger.');
    }
    $('ai-gen').disabled = sinTipos;
    $('ai-import').disabled = sinTipos;

    $('ai-modal').hidden = false;
    document.body.classList.add('modal-open');
    autoGrow($('ai-links'));
    autoGrow($('ai-extra'));
  }

  function closeAiModal() {
    saveAiPrefs();
    $('ai-modal').hidden = true;
    if ($('modal').hidden) document.body.classList.remove('modal-open');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Safari antiguo y http: el textarea ya esta a la vista, se selecciona.
    return Promise.reject(new Error('presse-papiers indisponible'));
  }

  $('ai-modal').addEventListener('click', function (e) {
    if (e.target.closest('[data-close-ai]')) return closeAiModal();

    if (e.target.id === 'ai-gen' || e.target.id === 'ai-copy') {
      // "Copier a nouveau" sin nada generado todavia: se genera igual, en vez
      // de no hacer nada y dejar al usuario mirando el boton.
      if (e.target.id === 'ai-gen' || !$('ai-prompt').value) {
        saveAiPrefs();
        $('ai-prompt').value = buildAiPrompt(formAiPrefs(), aiCtx());
        $('ai-prompt').scrollTop = 0;
      }
      var text = $('ai-prompt').value;
      if (!text) return;
      copyToClipboard(text).then(function () {
        $('ai-copy-state').textContent = 'Copi\u00e9 ! Colle-le dans ton IA.';
      }).catch(function () {
        $('ai-prompt').select();
        $('ai-copy-state').textContent = 'Copie automatique refus\u00e9e : le texte est s\u00e9lectionn\u00e9, ' +
          'fais Ctrl/Cmd + C.';
      });
      return;
    }

    if (e.target.id === 'ai-import') return importAiOffers();

    if (e.target.type === 'checkbox') {
      var group = e.target.closest('[data-ai-multi]');
      if (!group) return;
      e.target.closest('.chip').classList.toggle('is-on', e.target.checked);
      saveAiPrefs();
    }
  });

  $('ai-modal').addEventListener('input', function (e) {
    // ai-json y ai-prompt tienen su propio scroll: no crecen solos.
    if (e.target.id === 'ai-links' || e.target.id === 'ai-extra') autoGrow(e.target);
    if (e.target.id === 'ai-json') return updateAiFootHint();
    if (String(e.target.id).indexOf('ai-') === 0) saveAiPrefs();
  });
  $('ai-modal').addEventListener('change', saveAiPrefs);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('ai-modal').hidden) closeAiModal();
  });

  /** Lo que se ve en el pie: cuantas ofertas hay pegadas, antes de importar. */
  function updateAiFootHint() {
    var raw = $('ai-json').value;
    if (!String(raw).trim()) return ($('ai-foot-hint').textContent = '');
    var parsed = parseAiOffers(raw);
    $('ai-foot-hint').textContent = parsed.error
      ? 'JSON pas encore lisible'
      : parsed.offers.length + (parsed.offers.length === 1 ? ' offre d\u00e9tect\u00e9e' : ' offres d\u00e9tect\u00e9es');
  }

  /** Del JSON pegado a la hoja, en una sola peticion. */
  function importAiOffers() {
    hideBanner('ai-error');
    $('ai-report').innerHTML = '';

    var parsed = parseAiOffers($('ai-json').value);
    if (parsed.error) return showBanner('ai-error', parsed.error);

    var built = buildImportPayload(parsed.offers, aiCtx());
    if (built.error) return showBanner('ai-error', built.error);

    var rep = built.report;
    if (!rep.kept.length) {
      showBanner('ai-error', 'Rien \u00e0 importer : ' + (rep.skipped.length
        ? 'les ' + rep.skipped.length + ' offre(s) re\u00e7ues sont d\u00e9j\u00e0 dans ton suivi.'
        : 'la liste \u00ab offres \u00bb est vide.'));
      $('ai-report').innerHTML = aiReportHtml(rep, false);
      return;
    }

    var payload = built.payload;
    payload.profileId = state.profileId;

    $('ai-import').disabled = true;
    $('ai-import').textContent = 'Import en cours\u2026';

    api('importOffers', payload).then(function () {
      // La hoja ya lo tiene: ahora el estado local, sin recargar el perfil.
      ['companies', 'applications', 'questions', 'learnings', 'contacts'].forEach(function (k) {
        state[k] = state[k].concat(payload[k]);
      });
      renderCompanies();
      renderTracking();
      renderAllQuestions();
      $('ai-json').value = '';
      $('ai-foot-hint').textContent = rep.kept.length +
        (rep.kept.length === 1 ? ' offre import\u00e9e' : ' offres import\u00e9es');
      $('ai-report').innerHTML = aiReportHtml(rep, true);
      setSaveState('saved');
    }).catch(function (err) {
      showBanner('ai-error', 'Import impossible : ' + err.message +
        ' \u2014 rien n\u2019a \u00e9t\u00e9 ajout\u00e9, tu peux recoller le JSON et r\u00e9essayer.');
    }).then(function () {
      $('ai-import').disabled = false;
      $('ai-import').textContent = 'Importer les offres';
    });
  }

  function aiReportHtml(rep, done) {
    var h = '';
    if (done) {
      h += '<p class="ai-ok"><strong>' + rep.kept.length + ' offre' +
        (rep.kept.length === 1 ? '' : 's') + ' import\u00e9e' + (rep.kept.length === 1 ? '' : 's') +
        '</strong> dans le suivi, au statut \u00ab ' + esc(ST_A_VALIDER) + ' \u00bb' +
        (rep.newCompanies.length ? ', avec ' + rep.newCompanies.length + ' nouvelle' +
          (rep.newCompanies.length === 1 ? '' : 's') + ' entreprise' +
          (rep.newCompanies.length === 1 ? '' : 's') : '') + '.</p>';
      h += '<ul class="ai-list">' + rep.kept.map(function (k) {
        return '<li>' + esc(k.label) + (k.poste ? ' \u2014 ' + esc(k.poste) : '') +
          ' <span class="count-hint">(' + esc(k.jobType) + ')</span></li>';
      }).join('') + '</ul>';
    }
    if (rep.skipped.length) {
      h += '<p class="ai-note"><strong>' + rep.skipped.length + ' \u00e9cart\u00e9e' +
        (rep.skipped.length === 1 ? '' : 's') + ' \u00e0 l\u2019import :</strong></p>' +
        '<ul class="ai-list">' + rep.skipped.map(function (k) {
          return '<li>' + esc(k.label) + ' \u2014 ' + esc(k.why) + '</li>';
        }).join('') + '</ul>';
    }
    if (rep.warnings.length) {
      h += '<ul class="ai-list ai-list--warn">' + rep.warnings.map(function (w) {
        return '<li>' + esc(w) + '</li>';
      }).join('') + '</ul>';
    }
    if (done) {
      h += '<p class="ai-note">Ouvre chaque fiche pour v\u00e9rifier, puis garde ou \u00e9carte l\u2019offre. ' +
        'Rien n\u2019est envoy\u00e9 \u00e0 ta place.</p>';
    }
    return h;
  }


  // =====================================================================
  //  Les deux autres recherches : vehicule et logement
  //
  //  Las tres busquedas tienen la misma forma: donde buscar, mis criterios,
  //  los candidatos con una columna por criterio, los anuncios y su ficha.
  //  Lo comun vive aqui una sola vez, con el dominio ('veh' | 'home') como
  //  parametro; lo que cambia son los campos de cada anuncio.
  // =====================================================================

  var LS_TAB = 'estrasburgo.tab';
  var TABS = ['emploi', 'vehicule', 'logement'];

  // ------------------------------------------------------- catalogos: sitios

  var SITES = {
    veh: [
      { key: 'lacentrale', name: 'La Centrale',
        why: 'La r\u00e9f\u00e9rence de l\u2019occasion en France, avec la cote gratuite.',
        links: [{ label: 'Occasions Grand Est', url: 'https://www.lacentrale.fr/listing?regions=FR-GES' },
                { label: 'Cote gratuite', url: 'https://www.lacentrale.fr/cote-voitures-occasion.php' }] },
      { key: 'leboncoin', name: 'Leboncoin',
        why: 'Le plus de choix entre particuliers, et souvent les meilleurs prix.',
        links: [{ label: 'Voitures Strasbourg', url: 'https://www.leboncoin.fr/recherche?category=2&locations=Strasbourg_67000' }] },
      { key: 'autoscout24', name: 'AutoScout24',
        why: 'Beaucoup d\u2019occasions allemandes, souvent bien entretenues. Fronti\u00e8re \u00e0 10 km.',
        links: [{ label: 'Autour de 67000', url: 'https://www.autoscout24.fr/lst?cy=F&zip=67000&zipr=50' }] },
      { key: 'paruvendu', name: 'ParuVendu',
        why: 'Des annonces qu\u2019on ne voit pas ailleurs, surtout chez les petits garages.',
        links: [{ label: 'Autos', url: 'https://www.paruvendu.fr/auto-moto/' }] },
      { key: 'reconditionne', name: 'Occasions reconditionn\u00e9es',
        why: 'Plus cher qu\u2019un particulier, mais garanti et sans surprise.',
        links: [{ label: 'Aramisauto', url: 'https://www.aramisauto.com/achat' },
                { label: 'Spoticar', url: 'https://www.spoticar.fr/vehicules-occasion' },
                { label: 'Renault Occasions', url: 'https://occasions.renault.fr/' }] },
      { key: 'mandataires', name: 'Neuf remis\u00e9 (mandataires)',
        why: 'Du neuf 15 \u00e0 25 % moins cher qu\u2019en concession, m\u00eame garantie constructeur.',
        links: [{ label: 'Elite Auto', url: 'https://www.eliteauto.fr/' },
                { label: 'Aramis neuf', url: 'https://www.aramisauto.com/neuf' }] },
      { key: 'garages', name: 'Garages et concessions autour de Strasbourg',
        why: 'Le stock local ne finit pas toujours en ligne. Passer voir marche encore.',
        links: [{ label: 'Chercher', url: 'https://www.google.com/maps/search/garage+voiture+occasion+Strasbourg' }] },
      { key: 'histovec', name: 'Histovec \u2014 l\u2019historique officiel',
        why: 'GRATUIT et officiel : accidents, kilom\u00e9trages, propri\u00e9taires. \u00c0 demander AVANT d\u2019acheter.',
        links: [{ label: 'Histovec', url: 'https://histovec.interieur.gouv.fr/' }] },
      { key: 'nongage', name: 'Certificat de non-gage',
        why: 'Prouve que la voiture n\u2019est pas gag\u00e9e ni oppos\u00e9e. Le vendeur doit le fournir.',
        links: [{ label: 'Demander', url: 'https://siv.interieur.gouv.fr/map-usg-ui/do/accueil_certificat' }] },
      { key: 'zfe', name: 'ZFE de Strasbourg et Crit\u2019Air',
        why: 'Strasbourg limite les vieux diesels : v\u00e9rifier la vignette AVANT d\u2019acheter.',
        links: [{ label: 'ZFE Eurom\u00e9tropole', url: 'https://www.strasbourg.eu/zone-a-faibles-emissions' },
                { label: 'Commander Crit\u2019Air', url: 'https://www.certificat-air.gouv.fr/' }] }
    ],
    home: [
      { key: 'seloger', name: 'SeLoger',
        why: 'Le plus gros volume d\u2019annonces d\u2019agences.',
        links: [{ label: 'Locations Strasbourg', url: 'https://www.seloger.com/immobilier/locations/immo-strasbourg-67/' }] },
      { key: 'leboncoin', name: 'Leboncoin',
        why: 'Les particuliers, donc sans frais d\u2019agence. \u00c7a part tr\u00e8s vite : y aller tous les jours.',
        links: [{ label: 'Locations Strasbourg', url: 'https://www.leboncoin.fr/recherche?category=10&locations=Strasbourg_67000' }] },
      { key: 'pap', name: 'PAP (de particulier \u00e0 particulier)',
        why: 'Que des particuliers, z\u00e9ro frais d\u2019agence.',
        links: [{ label: 'Strasbourg', url: 'https://www.pap.fr/annonce/locations-strasbourg-67000-g43913' }] },
      { key: 'bienici', name: 'Bien\u2019ici',
        why: 'La recherche sur carte est la meilleure : pratique pour viser un quartier.',
        links: [{ label: 'Carte Strasbourg', url: 'https://www.bienici.com/recherche/location/strasbourg-67000' }] },
      { key: 'agences', name: 'Agences de Strasbourg',
        why: 'Beaucoup ne publient que sur leur propre site. Passer en agence aide.',
        links: [{ label: 'Orpi', url: 'https://www.orpi.com/recherche/rent?transaction=rent&locations%5B0%5D%5Bvalue%5D=strasbourg' },
                { label: 'Foncia', url: 'https://fr.foncia.com/location/strasbourg-67000' },
                { label: 'Century 21', url: 'https://www.century21.fr/annonces/location-immobilier/' }] },
      { key: 'coloc', name: 'Colocation',
        why: 'Bien moins cher, et un moyen rapide de conna\u00eetre du monde en arrivant.',
        links: [{ label: 'La Carte des Colocs', url: 'https://www.lacartedescolocs.fr/colocations/france/strasbourg' },
                { label: 'Appartager', url: 'https://www.appartager.com/colocation/strasbourg' }] },
      { key: 'groupes', name: 'Groupes Facebook',
        why: 'Beaucoup de locations se font l\u00e0 avant d\u2019\u00eatre publi\u00e9es.',
        links: [{ label: 'Location Strasbourg', url: 'https://www.facebook.com/search/groups/?q=location%20appartement%20Strasbourg' }] },
      { key: 'dossierfacile', name: 'DossierFacile \u2014 mon dossier',
        why: 'Dossier locataire officiel et gratuit, v\u00e9rifi\u00e9 par l\u2019\u00c9tat : \u00e7a rassure les propri\u00e9taires. \u00c0 pr\u00e9parer AVANT de visiter.',
        links: [{ label: 'Cr\u00e9er mon dossier', url: 'https://www.dossierfacile.logement.gouv.fr/' }] },
      { key: 'visale', name: 'Visale \u2014 le garant gratuit',
        why: 'Garantie de l\u2019\u00c9tat quand on n\u2019a pas de garant en France. Beaucoup l\u2019acceptent.',
        links: [{ label: 'Visale', url: 'https://www.visale.fr/' }] },
      { key: 'apl', name: 'Aide au logement (CAF)',
        why: '\u00c0 simuler avant de signer : \u00e7a change le loyer r\u00e9el.',
        links: [{ label: 'Simulation CAF', url: 'https://wwwd.caf.fr/wps/portal/caffr/aidesetdemarches/mesdemarches/faireunesimulation/lelogement' }] },
      { key: 'anil', name: 'ANIL \u2014 mes droits',
        why: 'Ce que le propri\u00e9taire peut demander ou pas, les plafonds, le bail.',
        links: [{ label: 'ANIL', url: 'https://www.anil.org/' }] }
    ]
  };

  // -------------------------------------------------- catalogos: criterios

  var CRITERIA_SEED = {
    veh: [
      ['Budget total tout compris', 'Prix + carte grise + assurance + petites r\u00e9parations \u00e0 pr\u00e9voir', 'Haute'],
      ['Fiabilit\u00e9 connue du mod\u00e8le', 'Ce qu\u2019en disent les forums et les garagistes, pas la pub', 'Haute'],
      ['Vignette Crit\u2019Air compatible ZFE', 'Strasbourg restreint les vieux diesels : Crit\u2019Air 2 minimum', 'Haute'],
      ['Co\u00fbt d\u2019entretien et pi\u00e8ces', 'Pi\u00e8ces trouvables et pas ch\u00e8res, r\u00e9vision \u00e0 un prix raisonnable', 'Moyenne'],
      ['Consommation r\u00e9elle', 'Ce que \u00e7a consomme vraiment, pas la fiche technique', 'Moyenne'],
      ['Kilom\u00e9trage raisonnable', 'Coh\u00e9rent avec l\u2019\u00e2ge : environ 15 000 km par an', 'Moyenne'],
      ['Entretien suivi', 'Carnet et factures, r\u00e9visions faites aux bons kilom\u00e9trages', 'Haute'],
      ['Assurance abordable', 'Demander un devis avant d\u2019acheter : \u00e7a surprend parfois', 'Moyenne'],
      ['Taille et coffre', 'Assez grand pour ce que j\u2019en fais, assez petit pour se garer ici', 'Moyenne'],
      ['Bo\u00eete automatique', 'Confort en ville, mais plus cher et plus fragile', 'Basse']
    ],
    home: [
      ['Loyer + charges dans le budget', 'Charges comprises, et v\u00e9rifier ce qu\u2019elles couvrent', 'Haute'],
      ['Temps de trajet au travail', '\u00c0 l\u2019heure de pointe, en tram ou en v\u00e9lo, porte \u00e0 porte', 'Haute'],
      ['Surface et nombre de pi\u00e8ces', 'Ce dont j\u2019ai besoin pour vivre et pour travailler', 'Haute'],
      ['Chauffage pas ruineux', 'DPE, type de chauffage, et une facture d\u2019hiver \u00e0 demander', 'Haute'],
      ['Aucune humidit\u00e9', 'Odeur, taches aux angles, derri\u00e8re les meubles', 'Haute'],
      ['Lumineux', 'Orientation, et \u00e0 quelle heure la lumi\u00e8re entre vraiment', 'Moyenne'],
      ['Calme', 'La rue, les voisins, l\u2019immeuble \u2014 y repasser un soir', 'Moyenne'],
      ['Cuisine \u00e9quip\u00e9e', 'Ce qui est fourni exactement : plaques, four, frigo', 'Moyenne'],
      ['Commerces et tram \u00e0 pied', 'Courses, pharmacie, arr\u00eat de tram \u00e0 moins de 10 minutes', 'Moyenne'],
      ['Cave, v\u00e9lo, parking', 'O\u00f9 mettre les v\u00e9los et les affaires', 'Basse'],
      ['Fibre internet', 'Quel op\u00e9rateur passe dans l\u2019immeuble', 'Moyenne']
    ]
  };

  // ------------------------------------------- catalogos: listas de revision

  var INSPECTIONS = {
    veh: [
      'Demander le rapport Histovec au vendeur (gratuit, officiel : accidents, kilom\u00e9trages, propri\u00e9taires)',
      'Carte grise au nom du vendeur, et son identit\u00e9 v\u00e9rifi\u00e9e',
      'Certificat de situation administrative (non-gage) de moins de 15 jours',
      'Contr\u00f4le technique de moins de 6 mois \u2014 lire TOUTES les remarques, pas seulement \u00ab favorable \u00bb',
      'Carnet d\u2019entretien et factures : quelles r\u00e9visions, \u00e0 quels kilom\u00e9trages',
      'Courroie de distribution : chang\u00e9e quand, \u00e0 quel kilom\u00e9trage, facture \u00e0 l\u2019appui',
      'Embrayage : point de patinage, bruits, et \u00e0 quel kilom\u00e9trage il a \u00e9t\u00e9 fait',
      'D\u00e9marrage \u00e0 froid : arriver sans pr\u00e9venir, le moteur ne doit pas avoir tourn\u00e9',
      'Fum\u00e9e \u00e0 l\u2019\u00e9chappement au d\u00e9marrage puis en acc\u00e9l\u00e9rant',
      'Huile : niveau et couleur. Liquide de refroidissement : pas d\u2019\u00e9mulsion, pas d\u2019odeur',
      'Traces de fuite sous le moteur et sous la voiture',
      'Aucun voyant allum\u00e9 au tableau de bord \u2014 et aucun scotch\u00e9 ou enlev\u00e9',
      'Pneus : usure r\u00e9guli\u00e8re, m\u00eame marque, date (DOT) de moins de 5 ans',
      'Freins : bruit, vibration au freinage, \u00e9paisseur des disques',
      'Amortisseurs : appuyer sur chaque aile, la voiture ne doit pas rebondir',
      'Rouille : bas de caisse, passages de roue, coffre, sous les tapis',
      'Jeux entre les \u00e9l\u00e9ments de carrosserie, diff\u00e9rences de peinture : accident r\u00e9par\u00e9',
      'Climatisation : elle souffle froid, et quand a-t-elle \u00e9t\u00e9 recharg\u00e9e',
      'Tout l\u2019\u00e9lectrique : vitres, essuie-glaces, phares, clignotants, radio, prises',
      'Essai routier : ville + une portion \u00e0 90/110 km/h. Direction droite, pas de vibration',
      'Kilom\u00e9trage coh\u00e9rent avec l\u2019usure du volant, des p\u00e9dales et du si\u00e8ge',
      'Combien de propri\u00e9taires, et pourquoi il la vend',
      'N\u00e9gocier avec la cote (La Centrale / Argus) sous les yeux',
      'Chiffrer la carte grise et l\u2019assurance AVANT de dire oui'
    ],
    home: [
      'Loyer, charges, et ce que les charges couvrent exactement',
      'D\u00e9p\u00f4t de garantie et frais d\u2019agence : demander le d\u00e9tail (ils sont plafonn\u00e9s)',
      'DPE et type de chauffage \u2014 demander une facture d\u2019\u00e9nergie d\u2019un mois d\u2019hiver',
      'Fen\u00eatres : double vitrage, \u00e9tanch\u00e9it\u00e9. Les ouvrir et les fermer',
      'Humidit\u00e9 : odeur, taches noires aux angles, derri\u00e8re les meubles, sous l\u2019\u00e9vier',
      'Ouvrir les robinets : pression et temps avant l\u2019eau chaude',
      'Tableau \u00e9lectrique et nombre de prises par pi\u00e8ce',
      'Bruit : la rue, les voisins, l\u2019ascenseur. Y repasser un soir ou un samedi',
      'Luminosit\u00e9 et orientation : \u00e0 quelle heure la lumi\u00e8re entre',
      'Vis-\u00e0-vis depuis chaque fen\u00eatre',
      '\u00c9tat de la salle de bain et de la cuisine, et ce qui est fourni exactement',
      'Cave, local v\u00e9lo, parking : ils existent, et sont-ils inclus dans le loyer',
      'Internet : quel op\u00e9rateur et quel d\u00e9bit passent dans l\u2019immeuble',
      'Compteurs individuels (eau, chauffage) ou charges au forfait',
      'Travaux pr\u00e9vus dans l\u2019immeuble, et qui les paie',
      'Trajet r\u00e9el jusqu\u2019au travail \u00e0 l\u2019heure de pointe',
      'Commerces, pharmacie, laverie, arr\u00eat de tram : \u00e0 pied, chronom\u00e9tr\u00e9',
      'Date de disponibilit\u00e9, dur\u00e9e du bail, pr\u00e9avis pour partir',
      'Garant : est-ce que Visale est accept\u00e9',
      'Ce qu\u2019ils veulent dans le dossier \u2014 avoir DossierFacile pr\u00eat d\u2019avance',
      '\u00c9tat des lieux : tout photographier, noter m\u00eame les petits d\u00e9fauts',
      'Assurance habitation obligatoire : chiffrer avant de signer'
    ]
  };

  // -------------------------------------------------------- listas cerradas

  var VERDICTS = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'oui', label: '\u2713 Oui', tone: 'good' },
    { value: 'partiel', label: '~ En partie', tone: 'mid' },
    { value: 'non', label: '\u2717 Non', tone: 'bad' },
    { value: 'verifier', label: '? \u00c0 v\u00e9rifier', tone: 'progress' }
  ];

  var VEH_STATUTS = [
    { value: '', label: '\u00c0 contacter', tone: 'todo' },
    { value: 'Contact\u00e9e', label: 'Contact\u00e9e', tone: 'sent' },
    { value: 'Essai pr\u00e9vu', label: 'Essai pr\u00e9vu', tone: 'progress' },
    { value: 'Essay\u00e9e', label: 'Essay\u00e9e', tone: 'progress' },
    { value: 'N\u00e9gociation', label: 'N\u00e9gociation', tone: 'progress' },
    { value: 'Achet\u00e9e', label: 'Achet\u00e9e', tone: 'good' },
    { value: 'Sans r\u00e9ponse', label: 'Sans r\u00e9ponse', tone: 'low' },
    { value: 'Refus\u00e9e', label: 'Refus\u00e9e', tone: 'bad' },
    { value: ST_ECARTEE, label: '\u00c9cart\u00e9e', tone: 'low' }
  ];

  var HOME_STATUTS = [
    { value: '', label: '\u00c0 contacter', tone: 'todo' },
    { value: 'Contact\u00e9e', label: 'Contact\u00e9e', tone: 'sent' },
    { value: 'Visite pr\u00e9vue', label: 'Visite pr\u00e9vue', tone: 'progress' },
    { value: 'Visit\u00e9e', label: 'Visit\u00e9e', tone: 'progress' },
    { value: 'Dossier envoy\u00e9', label: 'Dossier envoy\u00e9', tone: 'progress' },
    { value: 'Accept\u00e9e', label: 'Accept\u00e9e', tone: 'good' },
    { value: 'Sans r\u00e9ponse', label: 'Sans r\u00e9ponse', tone: 'low' },
    { value: 'Refus\u00e9e', label: 'Refus\u00e9e', tone: 'bad' },
    { value: ST_ECARTEE, label: '\u00c9cart\u00e9e', tone: 'low' }
  ];

  var ETATS_VEH = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Neuf', label: 'Neuf', tone: 'good' },
    { value: 'Occasion', label: 'Occasion', tone: 'mid' }
  ];

  var VENDEURS_VEH = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Particulier', label: 'Particulier', tone: 'mid' },
    { value: 'Garage / concession', label: 'Garage / concession', tone: 'good' },
    { value: 'Mandataire', label: 'Mandataire', tone: 'good' }
  ];

  var VENDEURS_HOME = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Particulier', label: 'Particulier', tone: 'good' },
    { value: 'Agence', label: 'Agence', tone: 'mid' },
    { value: 'Bailleur social', label: 'Bailleur social', tone: 'good' },
    { value: 'Colocation', label: 'Colocation', tone: 'mid' }
  ];

  var MEUBLES = [
    { value: '', label: '\u2014', tone: 'todo' },
    { value: 'Meubl\u00e9', label: 'Meubl\u00e9', tone: 'good' },
    { value: 'Non meubl\u00e9', label: 'Non meubl\u00e9', tone: 'mid' }
  ];

  var DPE = (function () {
    var out = [{ value: '', label: '\u2014', tone: 'todo' }];
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(function (l, i) {
      out.push({ value: l, label: l, tone: i <= 2 ? 'good' : (i <= 3 ? 'mid' : 'bad') });
    });
    return out;
  })();

  /** Todo lo que cambia de un dominio a otro, en un solo sitio. */
  var DOM = {
    veh: {
      offers: 'vehOffers', action: 'upsertVehOffer', delAction: 'deleteVehOffer',
      statuts: VEH_STATUTS, label: 'annonce', labelPl: 'annonces'
    },
    home: {
      offers: 'homeOffers', action: 'upsertHomeOffer', delAction: 'deleteHomeOffer',
      statuts: HOME_STATUTS, label: 'annonce', labelPl: 'annonces'
    }
  };

  // ============================================================ onglets

  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'emploi';
    Array.prototype.forEach.call(document.querySelectorAll('[data-pane]'), function (pane) {
      pane.hidden = pane.getAttribute('data-pane') !== name;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (tab) {
      var on = tab.getAttribute('data-tab') === name;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    try { localStorage.setItem(LS_TAB, name); } catch (e) {}
    // Los mapas se miden mal mientras estan ocultos: hay que remedirlos.
    if (name === 'emploi') initCompaniesMap();
    if (name === 'logement') { initHomeMap(); syncHomeMarkers(); }
  }

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) showTab(tab.getAttribute('data-tab'));
  });

  // ====================================================== 1. les sites

  function siteId(domain, key) {
    return state.profileId + '::' + domain + '::' + key;
  }

  function sitesOf(domain) {
    return state.sites.filter(function (r) { return r.domain === domain; });
  }

  /** Devuelve (creandola en memoria si hace falta) la fila de un sitio. */
  function siteRow(domain, key) {
    var found = sitesOf(domain).filter(function (r) { return r.siteKey === key; })[0];
    if (found) return found;
    var row = {
      id: siteId(domain, key), profileId: state.profileId, domain: domain,
      siteKey: key, name: '', url: '', hecho: '', notas: ''
    };
    state.sites.push(row);
    return row;
  }

  function customSites(domain) {
    return sitesOf(domain).filter(function (r) {
      return !SITES[domain].some(function (d) { return d.key === r.siteKey; });
    });
  }

  function renderSites(domain) {
    var html = SITES[domain].map(function (def) {
      var row = sitesOf(domain).filter(function (r) { return r.siteKey === def.key; })[0] || {};
      var links = def.links.map(function (l) {
        return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
      }).join('<span class="sep">\u00b7</span>');
      var name = '<span class="ch-name" title="' + esc(def.why) + '">' + esc(def.name) + '</span>' +
        '<span class="ch-why">' + esc(def.why) + '</span>';
      return siteHtml(domain, def.key, name, links, row.hecho === 'si', row.notas || '', false);
    }).join('');

    html += customSites(domain).map(function (row) {
      var links = row.url
        ? '<a href="' + esc(normalizeUrl(row.url)) + '" target="_blank" rel="noopener">Ouvrir</a>'
        : '<input class="ch-url" data-sfield="url" value="' + esc(row.url) +
          '" placeholder="https://\u2026" spellcheck="false">';
      var name = '<input class="ch-name-input" data-sfield="name" value="' + esc(row.name) +
        '" placeholder="Nom du site">';
      return siteHtml(domain, row.siteKey, name, links, row.hecho === 'si', row.notas || '', true);
    }).join('');

    $(domain + '-sites').innerHTML = html;

    var total = SITES[domain].length + customSites(domain).length;
    var done = sitesOf(domain).filter(function (r) { return r.hecho === 'si'; }).length;
    $(domain + '-sites-count').textContent = done + ' / ' + total + ' d\u00e9j\u00e0 fait' + (done === 1 ? '' : 's');
  }

  function siteHtml(domain, key, nameHtml, linksHtml, done, notas, isCustom) {
    return '<div class="channel' + (done ? ' is-done' : '') + '" data-skey="' + esc(key) + '">' +
      '<input class="channel-check" type="checkbox" data-sfield="hecho"' + (done ? ' checked' : '') +
        ' aria-label="Marquer ce site comme fait">' +
      '<div class="ch-main">' + nameHtml + '</div>' +
      '<div class="ch-links">' + linksHtml + '</div>' +
      '<input class="channel-note" data-sfield="notas" value="' + esc(notas) + '" placeholder="Notes\u2026">' +
      (isCustom ? '<button class="row-del" type="button" data-sdel="1" ' +
        'aria-label="Retirer ce site">\u00d7</button>' : '') +
    '</div>';
  }

  /** Un solo juego de listeners por dominio. */
  function wireSites(domain) {
    var box = $(domain + '-sites');

    box.addEventListener('input', function (e) {
      var field = e.target.getAttribute('data-sfield');
      if (!field || e.target.type === 'checkbox') return;
      var row = siteRow(domain, e.target.closest('[data-skey]').getAttribute('data-skey'));
      row[field] = e.target.value;
      enqueue('site:' + row.id, 'upsertSite', row);
    });

    box.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-sfield') !== 'hecho') return;
      var wrap = e.target.closest('[data-skey]');
      var row = siteRow(domain, wrap.getAttribute('data-skey'));
      row.hecho = e.target.checked ? 'si' : '';
      wrap.classList.toggle('is-done', e.target.checked);
      enqueue('site:' + row.id, 'upsertSite', row);
      renderSites(domain);
    });

    box.addEventListener('click', function (e) {
      if (!e.target.getAttribute('data-sdel')) return;
      var key = e.target.closest('[data-skey]').getAttribute('data-skey');
      var row = sitesOf(domain).filter(function (r) { return r.siteKey === key; })[0];
      if (!row || !confirm('Retirer ce site ?')) return;
      state.sites = state.sites.filter(function (r) { return r.id !== row.id; });
      enqueue('site-del:' + row.id, 'deleteSite', { id: row.id });
      renderSites(domain);
    });
  }

  document.addEventListener('click', function (e) {
    var domain = e.target.getAttribute('data-add-site');
    if (!domain) return;
    var row = {
      id: uid(), profileId: state.profileId, domain: domain, siteKey: uid(),
      name: '', url: '', hecho: '', notas: ''
    };
    state.sites.push(row);
    enqueue('site:' + row.id, 'upsertSite', row);
    renderSites(domain);
    focusLast('#' + domain + '-sites [data-sfield="name"]');
  });

  // =================================================== 2. les criteres

  function criteriaOf(domain) {
    return state.criteria.filter(function (r) { return r.domain === domain; });
  }

  function critLabel(row, i) {
    return (row.label && row.label.trim()) || 'Crit\u00e8re ' + (i + 1);
  }

  function renderCriteria(domain) {
    var rows = criteriaOf(domain);
    var body = $(domain + '-criteria-body');

    body.innerHTML = rows.length ? rows.map(function (r, i) {
      return '<tr data-critid="' + esc(r.id) + '">' +
        '<td data-label="Crit\u00e8re"><input class="cell-input" data-field="label" value="' +
          esc(r.label) + '" placeholder="Ex. : loyer dans le budget"></td>' +
        '<td data-label="Concr\u00e8tement"><textarea class="cell-input" data-field="detalle" rows="1" ' +
          'placeholder="Ce que \u00e7a veut dire pour toi">' + esc(r.detalle) + '</textarea></td>' +
        '<td data-label="Importance">' + selectHtml(PRIORITES, r.importancia, 'importancia') + '</td>' +
        '<td class="cell-actions"><button class="row-del" type="button" data-critdel="1" ' +
          'aria-label="Retirer ce crit\u00e8re">\u00d7</button></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="4" data-label=""><p class="empty" style="margin:10px">' +
      'Aucun crit\u00e8re. Ajoute les tiens, ou pars de la liste toute faite.</p></td></tr>';

    $(domain + '-criteria-count').textContent = rows.length
      ? rows.length + (rows.length === 1 ? ' crit\u00e8re' : ' crit\u00e8res') + ' \u2014 autant de colonnes plus bas'
      : '';
    autoGrowAll(body);
  }

  function wireCriteria(domain) {
    var body = $(domain + '-criteria-body');

    body.addEventListener('input', function (e) {
      var field = e.target.getAttribute('data-field');
      if (!field) return;
      var row = byId(state.criteria, e.target.closest('tr').getAttribute('data-critid'));
      if (!row) return;
      row[field] = e.target.value;
      if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
      if (field === 'label') renderChecks(domain);
      enqueue('crit:' + row.id, 'upsertCriterion', row);
    });

    body.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-field') !== 'importancia') return;
      var row = byId(state.criteria, e.target.closest('tr').getAttribute('data-critid'));
      if (!row) return;
      row.importancia = e.target.value;
      e.target.setAttribute('data-tone', toneOf(PRIORITES, e.target.value));
      enqueue('crit:' + row.id, 'upsertCriterion', row);
    });

    body.addEventListener('click', function (e) {
      if (!e.target.getAttribute('data-critdel')) return;
      var id = e.target.closest('tr').getAttribute('data-critid');
      var row = byId(state.criteria, id);
      if (!row) return;
      if (!confirm('Retirer \u00ab ' + (row.label || 'ce crit\u00e8re') + ' \u00bb et ses r\u00e9ponses ?')) return;
      state.criteria = state.criteria.filter(function (r) { return r.id !== id; });
      state.checks = state.checks.filter(function (c) { return c.criterionId !== id; });
      enqueue('crit-del:' + id, 'deleteCriterion', { id: id });
      renderCriteria(domain);
      renderChecks(domain);
    });
  }

  function addCriterion(domain, label, detalle, importancia) {
    var row = {
      id: uid(), profileId: state.profileId, domain: domain,
      position: nextPosition(criteriaOf(domain)),
      label: label || '', detalle: detalle || '', importancia: importancia || ''
    };
    state.criteria.push(row);
    enqueue('crit:' + row.id, 'upsertCriterion', row);
    return row;
  }

  document.addEventListener('click', function (e) {
    var add = e.target.getAttribute('data-add-criterion');
    if (add) {
      addCriterion(add);
      renderCriteria(add);
      renderChecks(add);
      return focusLast('#' + add + '-criteria-body [data-field="label"]');
    }

    var seed = e.target.getAttribute('data-seed-criteria');
    if (!seed) return;
    var faltan = CRITERIA_SEED[seed].filter(function (c) {
      return !criteriaOf(seed).some(function (r) { return normKey(r.label) === normKey(c[0]); });
    });
    if (!faltan.length) return alert('La liste toute faite est d\u00e9j\u00e0 l\u00e0.');
    if (!confirm('Ajouter ' + faltan.length + ' crit\u00e8re(s) tout faits ? Tu pourras les modifier ou les retirer.')) return;
    faltan.forEach(function (c) { addCriterion(seed, c[0], c[1], c[2]); });
    renderCriteria(seed);
    renderChecks(seed);
  });

  // ======================================= 3. la grille candidats x criteres

  function checkId(subjectId, criterionId) {
    return subjectId + '::' + criterionId;
  }

  /** La casilla de un candidato para un criterio. Se crea al tocarla. */
  function checkRow(domain, subjectId, criterionId) {
    var id = checkId(subjectId, criterionId);
    var found = byId(state.checks, id);
    if (found) return found;
    var row = {
      id: id, profileId: state.profileId, domain: domain,
      subjectId: subjectId, criterionId: criterionId, verdict: '', nota: ''
    };
    state.checks.push(row);
    return row;
  }

  function verdictOf(subjectId, criterionId) {
    var found = byId(state.checks, checkId(subjectId, criterionId));
    return found ? found.verdict : '';
  }

  /** Cuantos criterios cumple un candidato, sobre el total. */
  function scoreOf(domain, subjectId) {
    var crits = criteriaOf(domain);
    var ok = 0, ko = 0;
    crits.forEach(function (c) {
      var v = verdictOf(subjectId, c.id);
      if (v === 'oui') ok++;
      else if (v === 'non') ko++;
    });
    return { ok: ok, ko: ko, total: crits.length };
  }

  function scoreHtml(domain, subjectId) {
    var s = scoreOf(domain, subjectId);
    if (!s.total) return '<span class="count-hint">\u2014</span>';
    var tone = s.ko ? (s.ok > s.ko ? 'mid' : 'bad') : (s.ok ? 'good' : 'todo');
    return '<span class="score" data-tone="' + tone + '">' + s.ok + '/' + s.total + '</span>';
  }

  /**
   * La tabla de candidatos: unas columnas propias, luego una por criterio.
   * La usan los modelos de coche y la comparacion de pisos.
   */
  function checksGridHtml(domain, subjects, cols, subjAttr, delAttr) {
    var crits = criteriaOf(domain);

    var head = '<thead><tr>' +
      cols.map(function (c) {
        return '<th' + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) + '</th>';
      }).join('') +
      crits.map(function (c, i) {
        return '<th class="th-crit" title="' + esc(c.detalle || '') + '">' + esc(critLabel(c, i)) +
          (c.importancia === 'Haute' ? ' <span class="th-must">!</span>' : '') + '</th>';
      }).join('') +
      '<th style="width:62px">Score</th>' +
      '<th style="width:44px"><span class="sr-only">Actions</span></th>' +
    '</tr></thead>';

    var body = subjects.map(function (s) {
      return '<tr ' + subjAttr + '="' + esc(s.id) + '">' +
        cols.map(function (c) {
          return '<td data-label="' + esc(c.label) + '">' + c.html(s) + '</td>';
        }).join('') +
        crits.map(function (c, i) {
          return '<td data-label="' + esc(critLabel(c, i)) + '">' +
            selectHtml(VERDICTS, verdictOf(s.id, c.id), 'verdict', ' data-crit="' + esc(c.id) + '"') +
          '</td>';
        }).join('') +
        '<td data-label="Score">' + scoreHtml(domain, s.id) + '</td>' +
        '<td class="cell-actions"><button class="row-del" type="button" ' + delAttr + '="1" ' +
          'aria-label="Retirer cette ligne">\u00d7</button></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-wrap table-wrap--wide"><table class="grid grid--compare">' +
      head + '<tbody>' + body + '</tbody></table></div>';
  }

  /** Guarda un veredicto y refresca el score de esa fila, sin repintar todo. */
  function saveVerdict(domain, subjectId, critId, value, td) {
    var row = checkRow(domain, subjectId, critId);
    row.verdict = value;
    enqueue('check:' + row.id, 'upsertCheck', row);
    var tr = td.closest('tr');
    var cell = tr && tr.querySelector('[data-label="Score"]');
    if (cell) cell.innerHTML = scoreHtml(domain, subjectId);
  }


  function renderChecks(domain) {
    if (domain === 'veh') renderVehModels();
    else renderHomeCompare();
  }

  // ============================================== 3b. modeles de voiture

  function modelLabel(m, i) {
    var t = [m.marca, m.modelo].filter(function (x) { return x && x.trim(); }).join(' ');
    return t || 'Mod\u00e8le ' + (i + 1);
  }

  /** La photo del modelo es una URL: la hoja no guarda ficheros. */
  function thumbHtml(url) {
    var v = String(url || '').trim();
    if (!v) return '<span class="thumb thumb--empty" aria-hidden="true">\u1f697</span>';
    var safe = normalizeUrl(v);
    return '<a class="thumb" href="' + esc(safe) + '" target="_blank" rel="noopener" ' +
      'title="Ouvrir l\u2019image en grand">' +
      '<img src="' + esc(safe) + '" alt="" loading="lazy" ' +
      'onerror="this.parentNode.className=\'thumb thumb--broken\';this.remove();"></a>';
  }

  function renderVehModels() {
    var rows = state.vehModels;
    var box = $('veh-models');

    if (!rows.length) {
      box.innerHTML = '<p class="empty">Aucun mod\u00e8le. Ajoute ceux qui t\u2019int\u00e9ressent : ' +
        'chaque crit\u00e8re de la section 2 devient une colonne.</p>';
      $('veh-models-count').textContent = '';
      return;
    }

    box.innerHTML = checksGridHtml('veh', rows, [
      { label: 'Photo', width: '104px', html: function (m) {
        return thumbHtml(m.imagen) +
          '<input class="cell-sub-input" data-field="imagen" value="' + esc(m.imagen) +
            '" placeholder="URL de l\u2019image" spellcheck="false">';
      } },
      { label: 'Mod\u00e8le', width: '190px', html: function (m) {
        return '<input class="cell-input" data-field="marca" value="' + esc(m.marca) +
            '" placeholder="Marque">' +
          '<input class="cell-input" data-field="modelo" value="' + esc(m.modelo) +
            '" placeholder="Mod\u00e8le">';
      } },
      { label: 'Motorisation', width: '130px', html: function (m) {
        return '<input class="cell-input" data-field="motor" value="' + esc(m.motor) +
            '" placeholder="Ex. : 1.2 essence">' +
          '<input class="cell-sub-input" data-field="anos" value="' + esc(m.anos) +
            '" placeholder="Ann\u00e9es vis\u00e9es">';
      } },
      { label: 'Budget', width: '116px', html: function (m) {
        return '<div class="cell-pair">' +
          '<input class="cell-input" data-field="precioMin" value="' + esc(m.precioMin) +
            '" placeholder="min \u20ac" inputmode="numeric">' +
          '<input class="cell-input" data-field="precioMax" value="' + esc(m.precioMax) +
            '" placeholder="max \u20ac" inputmode="numeric">' +
        '</div>';
      } }
    ], 'data-vmid', 'data-vmdel');

    $('veh-models-count').textContent = rows.length +
      (rows.length === 1 ? ' mod\u00e8le' : ' mod\u00e8les') + ' \u00b7 ' + criteriaOf('veh').length + ' crit\u00e8res';
    autoGrowAll(box);
  }

  $('veh-models').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-field');
    if (!field) return;
    var row = byId(state.vehModels, e.target.closest('tr').getAttribute('data-vmid'));
    if (!row) return;
    row[field] = e.target.value;
    if (field === 'imagen') {
      var cell = e.target.closest('td');
      var old = cell.querySelector('.thumb');
      var fresh = document.createElement('div');
      fresh.innerHTML = thumbHtml(e.target.value);
      if (old) cell.replaceChild(fresh.firstChild, old);
    }
    if (field === 'marca' || field === 'modelo') renderVehOffers();
    enqueue('vmodel:' + row.id, 'upsertVehModel', row);
  });

  $('veh-models').addEventListener('change', function (e) {
    var crit = e.target.getAttribute('data-crit');
    if (!crit) return;
    var id = e.target.closest('tr').getAttribute('data-vmid');
    e.target.setAttribute('data-tone', toneOf(VERDICTS, e.target.value));
    saveVerdict('veh', id, crit, e.target.value, e.target.closest('td'));
  });

  $('veh-models').addEventListener('click', function (e) {
    if (!e.target.getAttribute('data-vmdel')) return;
    var id = e.target.closest('tr').getAttribute('data-vmid');
    var row = byId(state.vehModels, id);
    if (!row) return;
    var offers = state.vehOffers.filter(function (o) { return o.modelId === id; });
    var msg = offers.length
      ? 'Retirer \u00ab ' + modelLabel(row, 0) +' \u00bb et ses ' + offers.length + ' annonce(s) ?'
      : 'Retirer ce mod\u00e8le ?';
    if (!confirm(msg)) return;
    var goneOffers = offers.map(function (o) { return o.id; });
    state.vehModels = state.vehModels.filter(function (m) { return m.id !== id; });
    state.vehOffers = state.vehOffers.filter(function (o) { return o.modelId !== id; });
    state.inspections = state.inspections.filter(function (r) { return goneOffers.indexOf(r.offerId) < 0; });
    state.checks = state.checks.filter(function (c) { return c.subjectId !== id; });
    enqueue('vmodel-del:' + id, 'deleteVehModel', { id: id });
    renderVehModels();
    renderVehOffers();
  });

  $('veh-add-model').addEventListener('click', function () {
    var row = {
      id: uid(), profileId: state.profileId, position: nextPosition(state.vehModels),
      marca: '', modelo: '', motor: '', anos: '', precioMin: '', precioMax: '',
      imagen: '', notas: ''
    };
    state.vehModels.push(row);
    enqueue('vmodel:' + row.id, 'upsertVehModel', row);
    renderVehModels();
    focusLast('#veh-models [data-field="marca"]');
  });

  // ================================================ 4. les annonces

  function offersOf(domain) {
    return state[DOM[domain].offers];
  }

  function offerLabel(o) {
    return (o && o.titulo && o.titulo.trim()) || 'Annonce sans titre';
  }

  function inspectionsOf(domain, offerId) {
    return state.inspections.filter(function (r) {
      return r.domain === domain && r.offerId === offerId;
    });
  }

  /**
   * El contador del boton Fiche. Solo cuenta cuando ya se ha tocado algo: si
   * no, todas las annonces llevarian \u00ab0/24\u00bb sin haber hecho nada.
   */
  function offerBadge(domain, o) {
    if (!inspectionsOf(domain, o.id).length) return 0;
    var items = inspectionItems(domain, o.id);
    var done = items.filter(function (r) { return r.done === 'si'; }).length;
    return items.length ? done + '/' + items.length : 0;
  }

  /** La barra de la seccion: filtro de lo oculto, igual que en el suivi. */
  function renderOfferBar(domain) {
    var rows = offersOf(domain);
    var hidden = rows.filter(isHidden).length;
    $(domain + '-bar').innerHTML =
      '<button class="btn btn--primary btn--sm" type="button" data-add-offer="' + domain + '">' +
        '+ Ajouter une annonce</button>' +
      '<span class="topbar-spacer"></span>' +
      (hidden ? '<button class="btn btn--ghost btn--sm" type="button" data-toggle-hidden-d="' + domain +
        '" title="Les annonces refus\u00e9es ou \u00e9cart\u00e9es restent dans ta feuille, elles sont juste ' +
        'masqu\u00e9es ici.">' + (showHidden ? 'Masquer' : 'Afficher') + ' les ' + hidden +
        ' masqu\u00e9e' + (hidden === 1 ? '' : 's') + '</button>' : '');
  }

  function renderOfferStats(domain, cards) {
    var box = $(domain + '-stats');
    box.innerHTML = offersOf(domain).length ? cards.map(function (c) {
      return '<div class="stat"><div class="stat-value">' + c.value + '</div>' +
             '<div class="stat-label">' + esc(c.label) + '</div></div>';
    }).join('') : '';
  }

  // ---------------------------------------------------- les voitures

  function renderVehOffers() {
    var all = state.vehOffers;
    var rows = visibleApps(all);
    var oculto = all.length - rows.length;

    renderOfferBar('veh');
    renderOfferStats('veh', vehCards());

    var modelOptions = function (o) {
      return '<select class="cell-select" data-field="modelId">' +
        '<option value=""' + (o.modelId ? '' : ' selected') + '>\u2014 sans mod\u00e8le \u2014</option>' +
        state.vehModels.map(function (m, i) {
          return '<option value="' + esc(m.id) + '"' + (m.id === o.modelId ? ' selected' : '') + '>' +
            esc(modelLabel(m, i)) + '</option>';
        }).join('') + '</select>';
    };

    $('veh-offers').innerHTML = '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th style="width:10%">Vue le</th>' +
        '<th style="width:24%">L\u2019annonce</th>' +
        '<th style="width:14%">Mod\u00e8le</th>' +
        '<th style="width:10%">Prix</th>' +
        '<th style="width:12%">Km / ann\u00e9e</th>' +
        '<th style="width:10%">\u00c9tat</th>' +
        '<th style="width:13%">Statut</th>' +
        '<th style="width:7%">Note</th>' +
        '<th style="width:82px"><span class="sr-only">Actions</span></th>' +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (o) {
        var mark = isHidden(o) ? ' class="is-masquee"' : '';
        return '<tr data-void="' + esc(o.id) + '"' + mark + '>' +
          '<td data-label="Vue le"><input class="cell-input" type="date" data-field="fecha" value="' +
            esc(o.fecha) + '"></td>' +
          '<td data-label="L\u2019annonce">' +
            '<input class="cell-input" data-field="titulo" value="' + esc(o.titulo) +
              '" placeholder="Ex. : Clio IV 1.2 \u2014 2016">' +
            '<div class="cell-sub">' +
              '<input class="cell-sub-input" data-field="enlace" value="' + esc(o.enlace) +
                '" placeholder="Lien de l\u2019annonce" inputmode="url" spellcheck="false">' +
              linkOutHtml(o.enlace) +
            '</div>' +
          '</td>' +
          '<td data-label="Mod\u00e8le">' + modelOptions(o) + '</td>' +
          '<td data-label="Prix"><input class="cell-input" data-field="precio" value="' +
            esc(o.precio) + '" placeholder="\u20ac" inputmode="numeric"></td>' +
          '<td data-label="Km / ann\u00e9e"><div class="cell-pair">' +
            '<input class="cell-input" data-field="km" value="' + esc(o.km) +
              '" placeholder="km" inputmode="numeric">' +
            '<input class="cell-input" data-field="ano" value="' + esc(o.ano) +
              '" placeholder="ann\u00e9e" inputmode="numeric">' +
          '</div></td>' +
          '<td data-label="\u00c9tat">' + selectHtml(ETATS_VEH, o.estadoVeh, 'estadoVeh') + '</td>' +
          '<td data-label="Statut">' + selectHtml(VEH_STATUTS, o.estado, 'estado') + '</td>' +
          '<td data-label="Note">' + selectHtml(NOTES, o.nota, 'nota') + '</td>' +
          '<td class="cell-actions cell-actions--wide">' +
            '<button class="btn-fiche" type="button" data-vofiche="1" ' +
              'title="Ouvrir la fiche">Fiche' +
              (offerBadge('veh', o) ? '<span class="fiche-badge">' + offerBadge('veh', o) +
                '</span>' : '') + '</button>' +
            '<button class="row-del" type="button" data-vodel="1" ' +
              'aria-label="Retirer cette annonce">\u00d7</button>' +
          '</td>' +
        '</tr>';
      }).join('')
        : '<tr><td colspan="9" data-label=""><p class="empty" style="margin:10px">' +
          (oculto ? 'Rien \u00e0 afficher : ' + oculto + ' annonce(s) masqu\u00e9e(s) au-dessus.'
                  : 'Aucune annonce pour l\u2019instant.') + '</p></td></tr>') +
      '</tbody></table></div>';

    autoGrowAll($('veh-offers'));
  }

  // ---------------------------------------------------- les logements

  function homeRent(o) {
    var a = Number(String(o.alquiler || '').replace(/[^\d.]/g, ''));
    var c = Number(String(o.cargas || '').replace(/[^\d.]/g, ''));
    if (isNaN(a) || !a) return null;
    return a + (isNaN(c) ? 0 : c);
  }

  function renderHomeOffers() {
    var all = state.homeOffers;
    var rows = visibleApps(all);
    var oculto = all.length - rows.length;

    renderOfferBar('home');
    renderOfferStats('home', homeCards());

    $('home-offers').innerHTML = '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th style="width:10%">Vue le</th>' +
        '<th style="width:26%">L\u2019annonce</th>' +
        '<th style="width:13%">Loyer + charges</th>' +
        '<th style="width:12%">Surface / pi\u00e8ces</th>' +
        '<th style="width:12%">Qui loue</th>' +
        '<th style="width:13%">Statut</th>' +
        '<th style="width:7%">Note</th>' +
        '<th style="width:82px"><span class="sr-only">Actions</span></th>' +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (o) {
        var total = homeRent(o);
        var mark = isHidden(o) ? ' class="is-masquee"' : '';
        return '<tr data-hoid="' + esc(o.id) + '"' + mark + '>' +
          '<td data-label="Vue le"><input class="cell-input" type="date" data-field="fecha" value="' +
            esc(o.fecha) + '"></td>' +
          '<td data-label="L\u2019annonce">' +
            '<input class="cell-input" data-field="titulo" value="' + esc(o.titulo) +
              '" placeholder="Ex. : T2 45 m\u00b2 Krutenau">' +
            '<div class="cell-sub">' +
              '<input class="cell-sub-input" data-field="enlace" value="' + esc(o.enlace) +
                '" placeholder="Lien de l\u2019annonce" inputmode="url" spellcheck="false">' +
              linkOutHtml(o.enlace) +
            '</div>' +
          '</td>' +
          '<td data-label="Loyer + charges"><div class="cell-pair">' +
            '<input class="cell-input" data-field="alquiler" value="' + esc(o.alquiler) +
              '" placeholder="loyer \u20ac" inputmode="numeric">' +
            '<input class="cell-input" data-field="cargas" value="' + esc(o.cargas) +
              '" placeholder="charges \u20ac" inputmode="numeric">' +
          '</div>' + (total ? '<span class="cell-total">= ' + total + ' \u20ac</span>' : '') + '</td>' +
          '<td data-label="Surface / pi\u00e8ces"><div class="cell-pair">' +
            '<input class="cell-input" data-field="superficie" value="' + esc(o.superficie) +
              '" placeholder="m\u00b2" inputmode="numeric">' +
            '<input class="cell-input" data-field="piezas" value="' + esc(o.piezas) +
              '" placeholder="pi\u00e8ces" inputmode="numeric">' +
          '</div></td>' +
          '<td data-label="Qui loue">' + selectHtml(VENDEURS_HOME, o.tipoVendedor, 'tipoVendedor') + '</td>' +
          '<td data-label="Statut">' + selectHtml(HOME_STATUTS, o.estado, 'estado') + '</td>' +
          '<td data-label="Note">' + selectHtml(NOTES, o.nota, 'nota') + '</td>' +
          '<td class="cell-actions cell-actions--wide">' +
            '<button class="btn-fiche" type="button" data-hofiche="1" title="Ouvrir la fiche">Fiche' +
              (offerBadge('home', o) ? '<span class="fiche-badge">' + offerBadge('home', o) +
                '</span>' : '') + '</button>' +
            '<button class="row-del" type="button" data-hodel="1" ' +
              'aria-label="Retirer cette annonce">\u00d7</button>' +
          '</td>' +
        '</tr>';
      }).join('')
        : '<tr><td colspan="8" data-label=""><p class="empty" style="margin:10px">' +
          (oculto ? 'Rien \u00e0 afficher : ' + oculto + ' annonce(s) masqu\u00e9e(s) au-dessus.'
                  : 'Aucune annonce pour l\u2019instant.') + '</p></td></tr>') +
      '</tbody></table></div>';

    autoGrowAll($('home-offers'));
  }

  function renderHomeCompare() {
    var rows = visibleApps(state.homeOffers);
    var box = $('home-compare');
    if (!rows.length) {
      box.innerHTML = '<p class="empty">Les annonces appara\u00eetront ici, une colonne par crit\u00e8re.</p>';
      return;
    }
    box.innerHTML = checksGridHtml('home', rows, [
      { label: 'L\u2019annonce', width: '200px', html: function (o) {
        return '<button class="link-btn" type="button" data-open-home="' + esc(o.id) + '">' +
          esc(offerLabel(o)) + '</button>';
      } },
      { label: 'Loyer', width: '90px', html: function (o) {
        var t = homeRent(o);
        return '<span class="cell-plain">' + (t ? t + ' \u20ac' : '\u2014') + '</span>';
      } },
      { label: 'Surface', width: '84px', html: function (o) {
        return '<span class="cell-plain">' + (o.superficie ? esc(o.superficie) + ' m\u00b2' : '\u2014') +
          (o.piezas ? ' \u00b7 T' + esc(o.piezas) : '') + '</span>';
      } }
    ], 'data-hoid', 'data-hodel-c');
  }

  // ------------------------------------------- listeners de las dos tablas

  /** Un solo juego para las dos tablas de anuncios y la comparacion. */
  function wireOffers(domain, boxId, attr, fiche, del) {
    var box = $(boxId);
    var conf = DOM[domain];
    var openDetailFor = domain === 'veh' ? openVehOffer : openHomeOffer;

    box.addEventListener('input', function (e) {
      var field = e.target.getAttribute('data-field');
      if (!field) return;
      var row = byId(offersOf(domain), e.target.closest('tr').getAttribute(attr));
      if (!row) return;
      row[field] = e.target.value;
      if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
      if (field === 'enlace') refreshLinkOut(e.target);
      if (domain === 'home' && (field === 'alquiler' || field === 'cargas' ||
          field === 'titulo' || field === 'superficie' || field === 'piezas')) {
        renderHomeCompare();
        if (field === 'titulo' || field === 'alquiler') syncHomeMarkers();
      }
      enqueue('offer:' + row.id, conf.action, row);
    });

    box.addEventListener('change', function (e) {
      var field = e.target.getAttribute('data-field');
      var crit = e.target.getAttribute('data-crit');
      var tr = e.target.closest('tr');

      if (crit) {
        e.target.setAttribute('data-tone', toneOf(VERDICTS, e.target.value));
        return saveVerdict(domain, tr.getAttribute(attr), crit, e.target.value, e.target.closest('td'));
      }
      if (!field || e.target.tagName !== 'SELECT') return;

      var row = byId(offersOf(domain), tr.getAttribute(attr));
      if (!row) return;
      row[field] = e.target.value;
      enqueue('offer:' + row.id, conf.action, row);

      if (field === 'estado') {
        if (isHidden(row) && !showHidden) return renderDomain(domain);
        e.target.setAttribute('data-tone', toneOf(conf.statuts, e.target.value));
        tr.className = isHidden(row) ? 'is-masquee' : '';
        return renderDomain(domain, true);
      }
      var lists = { nota: NOTES, estadoVeh: ETATS_VEH, tipoVendedor:
        domain === 'veh' ? VENDEURS_VEH : VENDEURS_HOME, muebles: MEUBLES, dpe: DPE };
      if (lists[field]) e.target.setAttribute('data-tone', toneOf(lists[field], e.target.value));
      if (field === 'modelId') renderVehOffers();
    });

    box.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open-home]');
      if (open) return openHomeOffer(open.getAttribute('data-open-home'));

      var f = e.target.closest('[' + fiche + ']');
      if (f) return openDetailFor(f.closest('tr').getAttribute(attr));

      if (!e.target.getAttribute(del)) return;
      var id = e.target.closest('tr').getAttribute(attr);
      var row = byId(offersOf(domain), id);
      if (!row) return;
      if (!confirm('Retirer \u00ab ' + offerLabel(row) + ' \u00bb et tout son d\u00e9tail ?')) return;
      state[conf.offers] = offersOf(domain).filter(function (o) { return o.id !== id; });
      state.inspections = state.inspections.filter(function (r) { return r.offerId !== id; });
      state.checks = state.checks.filter(function (c) { return c.subjectId !== id; });
      enqueue('offer-del:' + id, conf.delAction, { id: id });
      renderDomain(domain);
    });
  }

  /** Repinta un dominio entero (o solo sus cifras, si nada ha desaparecido). */
  function renderDomain(domain, onlyCounts) {
    if (domain === 'veh') {
      if (onlyCounts) return renderOfferStats('veh', vehCards());
      renderVehOffers();
    } else {
      if (onlyCounts) return renderOfferStats('home', homeCards());
      renderHomeOffers();
      renderHomeCompare();
      syncHomeMarkers();
    }
  }

  function vehCards() {
    var all = state.vehOffers;
    return [
      { value: all.length, label: all.length === 1 ? 'annonce' : 'annonces' },
      { value: all.filter(function (o) { return o.estado && o.estado !== ST_ECARTEE &&
          o.estado !== 'Refus\u00e9e'; }).length, label: 'contact\u00e9es' },
      { value: all.filter(function (o) { return o.estado === 'Essai pr\u00e9vu' ||
          o.estado === 'Essay\u00e9e'; }).length, label: 'essais' },
      { value: all.filter(function (o) { return Number(o.nota) >= 8; }).length, label: 'coups de c\u0153ur' }
    ];
  }

  function homeCards() {
    var all = state.homeOffers;
    return [
      { value: all.length, label: all.length === 1 ? 'annonce' : 'annonces' },
      { value: all.filter(function (o) { return o.estado && o.estado !== ST_ECARTEE &&
          o.estado !== 'Refus\u00e9e'; }).length, label: 'contact\u00e9es' },
      { value: all.filter(function (o) { return o.estado === 'Visite pr\u00e9vue' ||
          o.estado === 'Visit\u00e9e'; }).length, label: 'visites' },
      { value: all.filter(function (o) { return Number(o.nota) >= 8; }).length, label: 'coups de c\u0153ur' }
    ];
  }

  document.addEventListener('click', function (e) {
    var add = e.target.getAttribute('data-add-offer');
    if (add) return addOffer(add);
    var tg = e.target.getAttribute('data-toggle-hidden-d');
    if (tg) { showHidden = !showHidden; renderTracking(); renderDomain(tg); }
  });

  function addOffer(domain) {
    var row;
    if (domain === 'veh') {
      row = {
        id: uid(), profileId: state.profileId, modelId: '',
        position: nextPosition(state.vehOffers), fecha: today(), titulo: '', vendedor: '',
        tipoVendedor: '', precio: '', km: '', ano: '', estadoVeh: '', controlTecnico: '',
        enlace: '', telefono: '', ubicacion: '', estado: '', nota: '', notaComentario: '',
        proximaAccion: ''
      };
      state.vehOffers.push(row);
    } else {
      row = {
        id: uid(), profileId: state.profileId, position: nextPosition(state.homeOffers),
        fecha: today(), titulo: '', agencia: '', tipoVendedor: '', alquiler: '', cargas: '',
        superficie: '', piezas: '', planta: '', muebles: '', dpe: '', disponible: '',
        enlace: '', telefono: '', ubicacion: '', lat: '', lon: '', estado: '', nota: '',
        notaComentario: '', proximaAccion: ''
      };
      state.homeOffers.push(row);
    }
    enqueue('offer:' + row.id, DOM[domain].action, row);
    renderDomain(domain);
    focusLast('#' + domain + '-offers [data-field="titulo"]');
  }


  // ====================================== 5. les listes de verification

  /**
   * Los puntos a revisar de una oferta. Mientras no se toque nada, la lista
   * es la del catalogo y no ocupa ni una fila en la hoja; en cuanto se marca
   * algo, se guarda entera de una vez (asi el orden y los borrados funcionan).
   */
  function inspectionItems(domain, offerId) {
    var saved = {};
    inspectionsOf(domain, offerId).forEach(function (r) { saved[r.id] = r; });

    var items = [];
    INSPECTIONS[domain].forEach(function (text, i) {
      var id = offerId + '::' + i;
      var row = saved[id];
      delete saved[id];
      // Fila guardada con el texto vacio = punto que el usuario ha quitado.
      if (row && !String(row.item).trim()) return;
      items.push(row || { id: id, item: text, done: '', nota: '', isVirtual: true });
    });
    // Los puntos anadidos a mano van al final.
    Object.keys(saved).forEach(function (k) { items.push(saved[k]); });
    return items;
  }

  function cleanInspection(domain, offerId, id, item, position) {
    return {
      id: id, profileId: state.profileId, domain: domain, offerId: offerId,
      position: position, item: item, done: '', nota: ''
    };
  }

  /**
   * Materializa la lista del catalogo antes del primer cambio. Se manda de
   * golpe (una peticion), con el cambio del usuario ya aplicado dentro: asi
   * ninguna escritura pisa a la otra.
   */
  function ensureInspections(domain, offerId, apply) {
    var rows = [];
    inspectionItems(domain, offerId).forEach(function (r, i) {
      if (!r.isVirtual) return;
      var row = cleanInspection(domain, offerId, r.id, r.item, (i + 1) * 10);
      state.inspections.push(row);
      rows.push(row);
    });
    if (!rows.length) return apply();

    apply();   // el cambio del usuario entra antes de mandar el lote
    api('importRows', { table: 'Inspections', rows: rows }).catch(function (err) {
      showBanner('app-error', 'La liste de contr\u00f4le n\u2019a pas pu \u00eatre enregistr\u00e9e : ' + err.message);
    });
  }

  function renderInspections(domain, offerId, boxId) {
    var items = inspectionItems(domain, offerId);
    var virgen = !inspectionsOf(domain, offerId).length;
    var done = items.filter(function (r) { return r.done === 'si'; }).length;

    $(boxId).innerHTML =
      '<p class="md-hint">' + (virgen
        ? 'Liste type : ' + items.length + ' points. Coche ce que tu as v\u00e9rifi\u00e9 \u2014 ' +
          'elle s\u2019enregistre dans ta feuille d\u00e8s la premi\u00e8re case.'
        : done + ' / ' + items.length + ' v\u00e9rifi\u00e9s') + '</p>' +
      '<ul class="insp">' + items.map(function (r) {
        return '<li class="insp-item' + (r.done === 'si' ? ' is-done' : '') +
            '" data-inspid="' + esc(r.id) + '">' +
          '<input class="insp-check" type="checkbox" data-insp="done"' +
            (r.done === 'si' ? ' checked' : '') + ' aria-label="V\u00e9rifi\u00e9">' +
          '<div class="insp-main">' +
            '<textarea class="insp-text" data-insp="item" rows="1">' + esc(r.item) + '</textarea>' +
            '<input class="insp-note" data-insp="nota" value="' + esc(r.nota) +
              '" placeholder="Ce que le vendeur a r\u00e9pondu\u2026">' +
          '</div>' +
          '<button class="row-del" type="button" data-inspdel="1" ' +
            'aria-label="Retirer ce point">\u00d7</button>' +
        '</li>';
      }).join('') + '</ul>' +
      '<button class="btn btn--sm" type="button" data-inspadd="' + domain + '">+ Ajouter un point</button>';

    autoGrowAll($(boxId));
  }

  /**
   * Los tres listeners de una lista de revision. Se enganchan al cuerpo del
   * modal (wireBoxId), que existe desde el principio; la lista misma
   * (renderBoxId) solo aparece al abrir una ficha, asi que engancharse a ella
   * al arrancar dejaba la pagina entera sin funcionar.
   */
  function wireInspections(domain, wireBoxId, renderBoxId, getOfferId, afterChange) {
    var box = $(wireBoxId);

    box.addEventListener('input', function (e) {
      var field = e.target.getAttribute('data-insp');
      if (!field || field === 'done') return;
      var li = e.target.closest('[data-inspid]');
      var id = li.getAttribute('data-inspid');
      var offerId = getOfferId();
      if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
      ensureInspections(domain, offerId, function () {
        var row = byId(state.inspections, id);
        if (!row) return;
        row[field] = e.target.value;
        if (inspectionsOf(domain, offerId).length) {
          enqueue('insp:' + row.id, 'upsertInspection', row);
        }
      });
    });

    box.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-insp') !== 'done') return;
      var li = e.target.closest('[data-inspid]');
      var id = li.getAttribute('data-inspid');
      var checked = e.target.checked;
      var offerId = getOfferId();
      li.classList.toggle('is-done', checked);
      var recien = !inspectionsOf(domain, offerId).length;
      ensureInspections(domain, offerId, function () {
        var row = byId(state.inspections, id);
        if (!row) return;
        row.done = checked ? 'si' : '';
        if (!recien) enqueue('insp:' + row.id, 'upsertInspection', row);
      });
      renderInspections(domain, offerId, renderBoxId);
      if (afterChange) afterChange();
    });

    box.addEventListener('click', function (e) {
      var addFor = e.target.getAttribute('data-inspadd');
      if (addFor) {
        var offerId = getOfferId();
        return ensureInspections(domain, offerId, function () {
          var row = cleanInspection(domain, offerId, uid(), '',
            nextPosition(inspectionsOf(domain, offerId)));
          state.inspections.push(row);
          enqueue('insp:' + row.id, 'upsertInspection', row);
          renderInspections(domain, offerId, renderBoxId);
          focusLast('#' + renderBoxId + ' [data-insp="item"]');
        });
      }

      if (!e.target.getAttribute('data-inspdel')) return;
      var li = e.target.closest('[data-inspid]');
      var delId = li.getAttribute('data-inspid');
      var oid = getOfferId();
      var esDelCatalogo = delId.indexOf(oid + '::') === 0;

      ensureInspections(domain, oid, function () {
        if (esDelCatalogo) {
          // No se borra la fila: se le vacia el texto. Si se borrara, el punto
          // volveria a aparecer desde el catalogo en el siguiente repintado.
          var row = byId(state.inspections, delId);
          if (!row) return;
          row.item = '';
          row.done = '';
          enqueue('insp:' + row.id, 'upsertInspection', row);
        } else {
          state.inspections = state.inspections.filter(function (r) { return r.id !== delId; });
          enqueue('insp-del:' + delId, 'deleteInspection', { id: delId });
        }
      });
      renderInspections(domain, oid, renderBoxId);
      if (afterChange) afterChange();
    });
  }

  // ======================================== 6. la fiche d'une voiture

  var openVehId = null;

  function vehModelOf(o) {
    return o.modelId ? byId(state.vehModels, o.modelId) : null;
  }

  function telHtml(value) {
    var v = String(value || '').replace(/\s+/g, '');
    if (!v) return '';
    return ' <a class="link-out" href="tel:' + esc(v) + '" title="Appeler">\u1f4de</a>';
  }

  function openVehOffer(id) {
    var o = byId(state.vehOffers, id);
    if (!o) return;
    openVehId = id;

    var m = vehModelOf(o);
    $('veh-modal-title').textContent = offerLabel(o);
    $('veh-modal-sub').textContent = [m ? modelLabel(m, 0) : '', o.precio ? o.precio + ' \u20ac' : '',
      o.km ? o.km + ' km' : '', o.ano].filter(Boolean).join(' \u00b7 ') || 'Annonce de voiture';

    $('veh-modal-body').innerHTML =
      '<section class="md-block">' +
        '<h3 class="md-h">L\u2019annonce</h3>' +
        '<div class="md-grid">' +
          fieldBlock('Prix demand\u00e9', '<input class="input" data-vo="precio" value="' +
            esc(o.precio) + '" placeholder="\u20ac" inputmode="numeric">') +
          fieldBlock('Kilom\u00e9trage', '<input class="input" data-vo="km" value="' + esc(o.km) +
            '" placeholder="km" inputmode="numeric">') +
          fieldBlock('Ann\u00e9e', '<input class="input" data-vo="ano" value="' + esc(o.ano) +
            '" placeholder="Ex. : 2016" inputmode="numeric">') +
          fieldBlock('Neuf ou occasion',
            selectHtml(ETATS_VEH, o.estadoVeh, 'estadoVeh', ' data-vo-sel="estadoVeh"')) +
          fieldBlock('Qui vend',
            selectHtml(VENDEURS_VEH, o.tipoVendedor, 'tipoVendedor', ' data-vo-sel="tipoVendedor"')) +
          fieldBlock('Nom du vendeur', '<input class="input" data-vo="vendedor" value="' +
            esc(o.vendedor) + '" placeholder="Nom, ou nom du garage">') +
          fieldBlock('T\u00e9l\u00e9phone', '<input class="input" data-vo="telefono" value="' +
            esc(o.telefono) + '" placeholder="06\u2026" inputmode="tel">') +
          fieldBlock('Contr\u00f4le technique', '<input class="input" data-vo="controlTecnico" value="' +
            esc(o.controlTecnico) + '" placeholder="Ex. : fait 03/2026, sans remarque">') +
          fieldBlock('Statut', selectHtml(VEH_STATUTS, o.estado, 'estado', ' data-vo-sel="estado"')) +
          fieldBlock('Note globale', selectHtml(NOTES, o.nota, 'nota', ' data-vo-sel="nota"')) +
        '</div>' +
        fieldBlock('Lien de l\u2019annonce', '<input class="input" data-vo="enlace" value="' +
          esc(o.enlace) + '" placeholder="https://\u2026" spellcheck="false">') +
        fieldBlock('O\u00f9 la voir', '<input class="input" data-vo="ubicacion" value="' +
          esc(o.ubicacion) + '" placeholder="Ville, quartier, garage\u2026">') +
        fieldBlock('Pourquoi cette note', '<textarea class="input" data-vo="notaComentario" rows="2" ' +
          'placeholder="Ex. : bon prix, mais la distribution n\u2019a jamais \u00e9t\u00e9 faite">' +
          esc(o.notaComentario) + '</textarea>') +
        fieldBlock('Prochaine action', '<input class="input" data-vo="proximaAccion" value="' +
          esc(o.proximaAccion) + '" placeholder="Ex. : demander l\u2019Histovec">') +
      '</section>' +

      '<section class="md-block" id="veh-check-block"></section>';

    renderVehCheckBlock(o);
    $('veh-modal').hidden = false;
    document.body.classList.add('modal-open');
    autoGrowAll($('veh-modal-body'));
    updateVehFoot(o);
  }

  /** El bloque de abajo depende de si el coche es nuevo o de segunda mano. */
  function renderVehCheckBlock(o) {
    var box = $('veh-check-block');

    if (o.estadoVeh === 'Occasion') {
      box.innerHTML = '<h3 class="md-h">\u00c0 v\u00e9rifier avant d\u2019acheter</h3>' +
        '<div id="veh-insp"></div>';
      renderInspections('veh', o.id, 'veh-insp');
      return;
    }

    if (o.estadoVeh === 'Neuf') {
      box.innerHTML = '<h3 class="md-h">Neuf : ce qui se n\u00e9gocie</h3>' +
        '<ul class="md-list">' +
          '<li>La <strong>remise</strong> : compare le m\u00eame mod\u00e8le chez un mandataire avant de signer.</li>' +
          '<li>Le <strong>d\u00e9lai de livraison</strong> par \u00e9crit, et ce qui se passe s\u2019il d\u00e9borde.</li>' +
          '<li>Les <strong>options</strong> : lesquelles sont vraiment utiles, lesquelles se revendent.</li>' +
          '<li>La <strong>reprise</strong> de l\u2019ancienne voiture, chiffr\u00e9e s\u00e9par\u00e9ment du prix.</li>' +
          '<li>Le <strong>financement</strong> : le taux du concessionnaire contre celui de ta banque.</li>' +
          '<li>La <strong>garantie</strong> et ce qu\u2019elle couvre exactement, entretien inclus ou pas.</li>' +
        '</ul>';
      return;
    }

    box.innerHTML = '<h3 class="md-h">Neuf ou occasion ?</h3>' +
      '<p class="empty" style="margin:0">Choisis <strong>neuf</strong> ou <strong>occasion</strong> ' +
      'plus haut : pour une occasion, la liste de tout ce qu\u2019il faut demander au vendeur ' +
      'appara\u00eet ici.</p>';
  }

  function updateVehFoot(o) {
    // Se cuenta sobre la lista que se ve, no sobre las filas ya guardadas.
    var items = o.estadoVeh === 'Occasion' ? inspectionItems('veh', o.id) : [];
    var done = items.filter(function (r) { return r.done === 'si'; }).length;
    $('veh-modal-foot').textContent = items.length
      ? done + ' / ' + items.length + ' points v\u00e9rifi\u00e9s' : '';
  }

  function closeVehOffer() {
    $('veh-modal').hidden = true;
    if ($('modal').hidden && $('ai-modal').hidden && $('home-modal').hidden) {
      document.body.classList.remove('modal-open');
    }
    openVehId = null;
    renderVehOffers();
  }

  $('veh-modal').addEventListener('click', function (e) {
    if (e.target.closest('[data-close-veh]')) closeVehOffer();
  });

  $('veh-modal-body').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-vo');
    if (!field) return;
    var o = byId(state.vehOffers, openVehId);
    if (!o) return;
    o[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    enqueue('offer:' + o.id, 'upsertVehOffer', o);
  });

  $('veh-modal-body').addEventListener('change', function (e) {
    var field = e.target.getAttribute('data-vo-sel');
    if (!field) return;
    var o = byId(state.vehOffers, openVehId);
    if (!o) return;
    o[field] = e.target.value;
    var lists = { estadoVeh: ETATS_VEH, tipoVendedor: VENDEURS_VEH, estado: VEH_STATUTS, nota: NOTES };
    e.target.setAttribute('data-tone', toneOf(lists[field] || NOTES, e.target.value));
    enqueue('offer:' + o.id, 'upsertVehOffer', o);
    if (field === 'estadoVeh') renderVehCheckBlock(o);
  });

  wireInspections('veh', 'veh-modal-body', 'veh-insp', function () { return openVehId; }, function () {
    var o = byId(state.vehOffers, openVehId);
    if (o) updateVehFoot(o);
  });

  // ======================================= 7. la fiche d'un logement

  var openHomeId = null;
  var homeMap = null, homeMarker = null;
  var homeAllMap = null, homeMarkers = {}, homeFitKey = '', homeHl = null;

  function openHomeOffer(id) {
    var o = byId(state.homeOffers, id);
    if (!o) return;
    openHomeId = id;

    var total = homeRent(o);
    $('home-modal-title').textContent = offerLabel(o);
    $('home-modal-sub').textContent = [total ? total + ' \u20ac charges comprises' : '',
      o.superficie ? o.superficie + ' m\u00b2' : '', o.piezas ? 'T' + o.piezas : '',
      o.muebles].filter(Boolean).join(' \u00b7 ') || 'Annonce de logement';

    $('home-modal-body').innerHTML =
      '<section class="md-block">' +
        '<h3 class="md-h">L\u2019annonce</h3>' +
        '<div class="md-grid">' +
          fieldBlock('Loyer hors charges', '<input class="input" data-ho="alquiler" value="' +
            esc(o.alquiler) + '" placeholder="\u20ac" inputmode="numeric">') +
          fieldBlock('Charges', '<input class="input" data-ho="cargas" value="' + esc(o.cargas) +
            '" placeholder="\u20ac" inputmode="numeric">') +
          fieldBlock('Surface', '<input class="input" data-ho="superficie" value="' +
            esc(o.superficie) + '" placeholder="m\u00b2" inputmode="numeric">') +
          fieldBlock('Nombre de pi\u00e8ces', '<input class="input" data-ho="piezas" value="' +
            esc(o.piezas) + '" placeholder="Ex. : 2" inputmode="numeric">') +
          fieldBlock('\u00c9tage', '<input class="input" data-ho="planta" value="' + esc(o.planta) +
            '" placeholder="Ex. : 3e avec ascenseur">') +
          fieldBlock('Meubl\u00e9',
            selectHtml(MEUBLES, o.muebles, 'muebles', ' data-ho-sel="muebles"')) +
          fieldBlock('DPE', selectHtml(DPE, o.dpe, 'dpe', ' data-ho-sel="dpe"')) +
          fieldBlock('Libre \u00e0 partir de', '<input class="input" data-ho="disponible" value="' +
            esc(o.disponible) + '" placeholder="Ex. : 1er octobre">') +
          fieldBlock('Qui loue',
            selectHtml(VENDEURS_HOME, o.tipoVendedor, 'tipoVendedor', ' data-ho-sel="tipoVendedor"')) +
          fieldBlock('Agence ou contact', '<input class="input" data-ho="agencia" value="' +
            esc(o.agencia) + '" placeholder="Nom">') +
          fieldBlock('T\u00e9l\u00e9phone', '<input class="input" data-ho="telefono" value="' +
            esc(o.telefono) + '" placeholder="06\u2026" inputmode="tel">') +
          fieldBlock('Statut', selectHtml(HOME_STATUTS, o.estado, 'estado', ' data-ho-sel="estado"')) +
          fieldBlock('Note globale', selectHtml(NOTES, o.nota, 'nota', ' data-ho-sel="nota"')) +
        '</div>' +
        fieldBlock('Lien de l\u2019annonce', '<input class="input" data-ho="enlace" value="' +
          esc(o.enlace) + '" placeholder="https://\u2026" spellcheck="false">') +
        fieldBlock('Pourquoi cette note', '<textarea class="input" data-ho="notaComentario" rows="2" ' +
          'placeholder="Ex. : tr\u00e8s lumineux, mais loin du tram">' +
          esc(o.notaComentario) + '</textarea>') +
        fieldBlock('Prochaine action', '<input class="input" data-ho="proximaAccion" value="' +
          esc(o.proximaAccion) + '" placeholder="Ex. : rappeler l\u2019agence mardi">') +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">O\u00f9 c\u2019est</h3>' +
        '<div class="md-geo">' +
          '<input class="input" id="home-address" value="' + esc(o.ubicacion) +
            '" placeholder="Adresse ou quartier, puis \u00ab Chercher \u00bb">' +
          '<button class="btn btn--sm" type="button" id="home-geocode">Chercher</button>' +
        '</div>' +
        '<p class="md-hint" id="home-geo-hint"></p>' +
        '<div id="home-fiche-map" class="md-map"></div>' +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">Mes crit\u00e8res</h3>' +
        '<div id="home-crit-list"></div>' +
      '</section>' +

      '<section class="md-block">' +
        '<h3 class="md-h">\u00c0 demander et v\u00e9rifier pendant la visite</h3>' +
        '<div id="home-insp"></div>' +
      '</section>';

    renderHomeCritList(o);
    renderInspections('home', o.id, 'home-insp');

    $('home-modal').hidden = false;
    document.body.classList.add('modal-open');
    autoGrowAll($('home-modal-body'));
    initHomeFicheMap(o);
    updateHomeFoot(o);

    $('home-geocode').addEventListener('click', geocodeHome);
    $('home-address').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); geocodeHome(); }
    });
    $('home-address').addEventListener('input', function () {
      var row = byId(state.homeOffers, openHomeId);
      if (!row) return;
      row.ubicacion = $('home-address').value;
      enqueue('offer:' + row.id, 'upsertHomeOffer', row);
    });
  }

  /** Los criterios de la seccion 2, uno por linea, para esta oferta. */
  function renderHomeCritList(o) {
    var crits = criteriaOf('home');
    if (!crits.length) {
      $('home-crit-list').innerHTML = '<p class="empty" style="margin:0">Aucun crit\u00e8re pour ' +
        'l\u2019instant : ajoute-les dans la section 2 et ils appara\u00eetront ici.</p>';
      return;
    }
    var s = scoreOf('home', o.id);
    $('home-crit-list').innerHTML =
      '<p class="md-hint">' + s.ok + ' sur ' + s.total + ' crit\u00e8res remplis' +
        (s.ko ? ' \u00b7 ' + s.ko + ' non' : '') + '</p>' +
      crits.map(function (c, i) {
        return '<div class="md-row md-critrow" data-critid="' + esc(c.id) + '">' +
          '<div class="md-row-main">' +
            '<span class="md-critname">' + esc(critLabel(c, i)) +
              (c.importancia === 'Haute' ? ' <span class="th-must">!</span>' : '') + '</span>' +
            (c.detalle ? '<span class="md-critdet">' + esc(c.detalle) + '</span>' : '') +
          '</div>' +
          '<div class="md-row-side">' +
            selectHtml(VERDICTS, verdictOf(o.id, c.id), 'verdict', ' data-hcrit="1"') +
          '</div>' +
        '</div>';
      }).join('');
  }

  function updateHomeFoot(o) {
    var insp = inspectionItems('home', o.id);
    var done = insp.filter(function (r) { return r.done === 'si'; }).length;
    var s = scoreOf('home', o.id);
    $('home-modal-foot').textContent = [
      s.total ? s.ok + '/' + s.total + ' crit\u00e8res' : '',
      insp.length ? done + '/' + insp.length + ' points de visite' : ''
    ].filter(Boolean).join(' \u00b7 ');
  }

  function closeHomeOffer() {
    if (homeMap) { homeMap.remove(); homeMap = null; homeMarker = null; }
    $('home-modal').hidden = true;
    if ($('modal').hidden && $('ai-modal').hidden && $('veh-modal').hidden) {
      document.body.classList.remove('modal-open');
    }
    openHomeId = null;
    renderHomeOffers();
    renderHomeCompare();
    syncHomeMarkers();
  }

  $('home-modal').addEventListener('click', function (e) {
    if (e.target.closest('[data-close-home]')) closeHomeOffer();
  });

  $('home-modal-body').addEventListener('input', function (e) {
    var field = e.target.getAttribute('data-ho');
    if (!field) return;
    var o = byId(state.homeOffers, openHomeId);
    if (!o) return;
    o[field] = e.target.value;
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    enqueue('offer:' + o.id, 'upsertHomeOffer', o);
  });

  $('home-modal-body').addEventListener('change', function (e) {
    var hcrit = e.target.getAttribute('data-hcrit');
    if (hcrit) {
      var critId = e.target.closest('[data-critid]').getAttribute('data-critid');
      var row = checkRow('home', openHomeId, critId);
      row.verdict = e.target.value;
      e.target.setAttribute('data-tone', toneOf(VERDICTS, e.target.value));
      enqueue('check:' + row.id, 'upsertCheck', row);
      var o2 = byId(state.homeOffers, openHomeId);
      if (o2) { renderHomeCritList(o2); updateHomeFoot(o2); }
      return;
    }

    var field = e.target.getAttribute('data-ho-sel');
    if (!field) return;
    var o = byId(state.homeOffers, openHomeId);
    if (!o) return;
    o[field] = e.target.value;
    var lists = { muebles: MEUBLES, dpe: DPE, tipoVendedor: VENDEURS_HOME,
                  estado: HOME_STATUTS, nota: NOTES };
    e.target.setAttribute('data-tone', toneOf(lists[field] || NOTES, e.target.value));
    enqueue('offer:' + o.id, 'upsertHomeOffer', o);
  });

  wireInspections('home', 'home-modal-body', 'home-insp', function () { return openHomeId; }, function () {
    var o = byId(state.homeOffers, openHomeId);
    if (o) updateHomeFoot(o);
  });

  // ------------------------------------------------- la carte du logement

  function initHomeFicheMap(o) {
    var box = $('home-fiche-map');
    if (typeof L === 'undefined') {
      box.innerHTML = '<p class="empty" style="margin:0">La carte n\u2019a pas pu se charger. ' +
        'L\u2019adresse en texte est quand m\u00eame enregistr\u00e9e.</p>';
      return;
    }
    var pt = hasPoint(o) ? [Number(o.lat), Number(o.lon)] : STRASBOURG;
    homeMap = L.map(box, { scrollWheelZoom: false }).setView(pt, hasPoint(o) ? 15 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(homeMap);
    if (hasPoint(o)) placeHomeMarker(pt[0], pt[1], false);
    homeMap.on('click', function (e) { placeHomeMarker(e.latlng.lat, e.latlng.lng, true); });
    setTimeout(function () { if (homeMap) homeMap.invalidateSize(); }, 60);
  }

  function placeHomeMarker(lat, lon, save) {
    if (!homeMap) return;
    if (homeMarker) {
      homeMarker.setLatLng([lat, lon]);
    } else {
      homeMarker = L.marker([lat, lon], { draggable: true }).addTo(homeMap);
      homeMarker.on('dragend', function () {
        var p = homeMarker.getLatLng();
        storeHomeLatLon(p.lat, p.lng);
      });
    }
    if (save) storeHomeLatLon(lat, lon);
  }

  function storeHomeLatLon(lat, lon) {
    var o = byId(state.homeOffers, openHomeId);
    if (!o) return;
    o.lat = round6(lat);
    o.lon = round6(lon);
    enqueue('offer:' + o.id, 'upsertHomeOffer', o);
    $('home-geo-hint').textContent = 'Pos\u00e9 sur ' + o.lat + ', ' + o.lon +
      ' \u00b7 tu peux d\u00e9placer le point en le faisant glisser.';
  }

  function geocodeHome() {
    var input = $('home-address');
    var q = input.value.trim();
    var hint = $('home-geo-hint');
    var o = byId(state.homeOffers, openHomeId);
    if (!o) return;

    o.ubicacion = input.value;
    enqueue('offer:' + o.id, 'upsertHomeOffer', o);

    if (!q) { hint.textContent = '\u00c9cris une adresse pour la chercher.'; return; }
    if (!homeMap) { hint.textContent = 'La carte n\u2019est pas disponible, mais l\u2019adresse est enregistr\u00e9e.'; return; }

    hint.textContent = 'Recherche\u2026';
    geocodeAddress(q).then(function (pt) {
      if (!pt) {
        hint.textContent = 'Adresse introuvable. Clique sur la carte pour poser le point \u00e0 la main.';
        return;
      }
      homeMap.setView([pt.lat, pt.lon], 16);
      placeHomeMarker(pt.lat, pt.lon, true);
    }).catch(function () {
      hint.textContent = 'La recherche d\u2019adresse n\u2019a pas r\u00e9pondu. Clique sur la carte.';
    });
  }

  function initHomeMap() {
    var box = $('home-map');
    if (homeAllMap) {
      setTimeout(function () { if (homeAllMap) homeAllMap.invalidateSize(); }, 60);
      return;
    }
    if (typeof L === 'undefined') {
      box.innerHTML = '<p class="empty" style="margin:0">La carte n\u2019a pas pu se charger.</p>';
      return;
    }
    homeAllMap = L.map(box, { scrollWheelZoom: false }).setView(STRASBOURG, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(homeAllMap);
    setTimeout(function () { if (homeAllMap) homeAllMap.invalidateSize(); }, 60);
  }

  function homeMarkerLabel(o) {
    var t = homeRent(o);
    return offerLabel(o) + (t ? ' \u2014 ' + t + ' \u20ac' : '');
  }

  function syncHomeMarkers() {
    if (!homeAllMap) return;
    var visibles = visibleApps(state.homeOffers);

    Object.keys(homeMarkers).forEach(function (id) {
      var still = visibles.filter(function (o) { return o.id === id && hasPoint(o); })[0];
      if (!still) {
        homeAllMap.removeLayer(homeMarkers[id]);
        delete homeMarkers[id];
      }
    });

    var pts = [];
    visibles.forEach(function (o) {
      if (!hasPoint(o)) return;
      var pos = [Number(o.lat), Number(o.lon)];
      pts.push(pos);
      if (homeMarkers[o.id]) {
        homeMarkers[o.id].setLatLng(pos);
        if (homeMarkers[o.id].setTooltipContent) homeMarkers[o.id].setTooltipContent(homeMarkerLabel(o));
        return;
      }
      var mk = L.marker(pos).addTo(homeAllMap);
      if (mk.bindTooltip) mk.bindTooltip(homeMarkerLabel(o), { permanent: false });
      mk.on('click', function () { openHomeOffer(o.id); });
      homeMarkers[o.id] = mk;
    });

    var key = pts.map(function (p) { return p.join(','); }).sort().join('|');
    if (key !== homeFitKey) {
      homeFitKey = key;
      if (pts.length === 1) homeAllMap.setView(pts[0], 14);
      else if (pts.length > 1 && homeAllMap.fitBounds) homeAllMap.fitBounds(pts, { padding: [30, 30] });
    }
    $('home-map-hint').textContent = pts.length
      ? pts.length + ' annonce(s) plac\u00e9e(s) \u00b7 clique sur un point pour ouvrir sa fiche.'
      : 'Ouvre la fiche d\u2019une annonce et cherche son adresse pour la poser sur la carte.';
  }

  /** Al pasar por una fila, su punto resalta. Igual que en Entreprises. */
  $('home-offers').addEventListener('mouseover', function (e) {
    var tr = e.target.closest('[data-hoid]');
    var id = tr && tr.getAttribute('data-hoid');
    if (id === homeHl) return;
    if (homeHl && homeMarkers[homeHl]) {
      var el = homeMarkers[homeHl].getElement && homeMarkers[homeHl].getElement();
      if (el) el.classList.remove('marker-hl');
    }
    homeHl = id;
    if (id && homeMarkers[id]) {
      var el2 = homeMarkers[id].getElement && homeMarkers[id].getElement();
      if (el2) el2.classList.add('marker-hl');
    }
  });

  // ------------------------------------------------------------ montage

  function renderVehicule() {
    renderSites('veh');
    renderCriteria('veh');
    renderVehModels();
    renderVehOffers();
  }

  function renderLogement() {
    renderSites('home');
    renderCriteria('home');
    renderHomeOffers();
    renderHomeCompare();
    syncHomeMarkers();
  }

  wireSites('veh');
  wireSites('home');
  wireCriteria('veh');
  wireCriteria('home');
  wireOffers('veh', 'veh-offers', 'data-void', 'data-vofiche', 'data-vodel');
  wireOffers('home', 'home-offers', 'data-hoid', 'data-hofiche', 'data-hodel');
  wireOffers('home', 'home-compare', 'data-hoid', 'data-hofiche-c', 'data-hodel-c');

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('veh-modal').hidden) return closeVehOffer();
    if (!$('home-modal').hidden) return closeHomeOffer();
  });

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
