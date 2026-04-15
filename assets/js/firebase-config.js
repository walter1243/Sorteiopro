const fallbackConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

const firebaseConfig = (() => {
  if (typeof __firebase_config !== 'undefined') {
    try {
      return JSON.parse(__firebase_config);
    } catch (_) {
      return fallbackConfig;
    }
  }

  if (window.FIREBASE_CONFIG) {
    return window.FIREBASE_CONFIG;
  }

  return fallbackConfig;
})();

const appId = typeof __app_id !== 'undefined' ? __app_id : 'sorteiospro-v8-automation';

const LOCAL_DB_KEY = 'sorteiospro_local_db_v1';
const LOCAL_UID_KEY = 'sorteiospro_local_uid';

const localState = {
  docs: {},
  watchers: {
    doc: new Map(),
    collection: new Map()
  }
};

let mode = 'local';
let firebaseReady = false;
let firebaseModules = null;
let app = null;
let db = { mode: 'local' };
let auth = null;

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function loadLocalDb() {
  const raw = localStorage.getItem(LOCAL_DB_KEY);
  const parsed = safeParse(raw || '{}', {});
  localState.docs = parsed || {};
}

function saveLocalDb() {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(localState.docs));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeSegments(args) {
  if (!args.length) {
    return [];
  }

  if (typeof args[0] === 'string') {
    return args;
  }

  return args.slice(1);
}

function collectionDocs(path) {
  const prefix = `${path}/`;
  const rows = [];

  Object.entries(localState.docs).forEach(([key, value]) => {
    if (!key.startsWith(prefix)) {
      return;
    }

    const rest = key.slice(prefix.length);
    if (!rest || rest.includes('/')) {
      return;
    }

    rows.push({ id: rest, data: () => deepClone(value) });
  });

  return rows;
}

function localDocSnapshot(path) {
  const value = localState.docs[path];
  return {
    exists: () => value !== undefined,
    data: () => (value === undefined ? undefined : deepClone(value))
  };
}

function localCollectionSnapshot(path) {
  const rows = collectionDocs(path);
  return {
    forEach: (cb) => {
      rows.forEach((row) => cb(row));
    }
  };
}

function registerWatcher(kind, path, callback) {
  const map = localState.watchers[kind];
  if (!map.has(path)) {
    map.set(path, new Set());
  }
  map.get(path).add(callback);

  if (kind === 'doc') {
    callback(localDocSnapshot(path));
  } else {
    callback(localCollectionSnapshot(path));
  }

  return () => {
    const set = map.get(path);
    if (!set) {
      return;
    }
    set.delete(callback);
    if (!set.size) {
      map.delete(path);
    }
  };
}

function notifyLocal(path) {
  const docWatchers = localState.watchers.doc.get(path);
  if (docWatchers) {
    const snap = localDocSnapshot(path);
    docWatchers.forEach((cb) => cb(snap));
  }

  const idx = path.lastIndexOf('/');
  if (idx !== -1) {
    const collectionPath = path.slice(0, idx);
    const collectionWatchers = localState.watchers.collection.get(collectionPath);
    if (collectionWatchers) {
      const snap = localCollectionSnapshot(collectionPath);
      collectionWatchers.forEach((cb) => cb(snap));
    }
  }
}

async function initFirebaseModules() {
  if (firebaseReady) {
    return;
  }

  loadLocalDb();

  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
    const firestoreMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');

    firebaseModules = { appMod, firestoreMod, authMod };
    app = appMod.initializeApp(firebaseConfig);
    db = firestoreMod.getFirestore(app);
    auth = authMod.getAuth(app);
    mode = 'firebase';
    firebaseReady = true;
  } catch (error) {
    console.warn('Firebase indisponivel. Modo local ativado.', error);
    mode = 'local';
    firebaseReady = true;
  }
}

function createLocalUid() {
  let uid = localStorage.getItem(LOCAL_UID_KEY);
  if (!uid) {
    uid = `local_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(LOCAL_UID_KEY, uid);
  }
  return uid;
}

async function ensureAuth() {
  await initFirebaseModules();

  if (mode === 'firebase') {
    const { authMod } = firebaseModules;

    if (auth.currentUser) {
      return auth.currentUser;
    }

    try {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await authMod.signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await authMod.signInAnonymously(auth);
      }

      return await new Promise((resolve) => {
        const unsub = authMod.onAuthStateChanged(auth, (u) => {
          if (u) {
            unsub();
            resolve(u);
          }
        });
      });
    } catch (_) {
      mode = 'local';
    }
  }

  return { uid: createLocalUid() };
}

function doc(...args) {
  const segments = normalizeSegments(args);

  if (mode === 'firebase' && firebaseModules) {
    return firebaseModules.firestoreMod.doc(db, ...segments);
  }

  return { __local: true, type: 'doc', path: segments.join('/') };
}

function collection(...args) {
  const segments = normalizeSegments(args);

  if (mode === 'firebase' && firebaseModules) {
    return firebaseModules.firestoreMod.collection(db, ...segments);
  }

  return { __local: true, type: 'collection', path: segments.join('/') };
}

async function setDoc(ref, data) {
  await initFirebaseModules();

  if (mode === 'firebase' && firebaseModules) {
    return firebaseModules.firestoreMod.setDoc(ref, data);
  }

  localState.docs[ref.path] = deepClone(data);
  saveLocalDb();
  notifyLocal(ref.path);
}

async function getDoc(ref) {
  await initFirebaseModules();

  if (mode === 'firebase' && firebaseModules) {
    return firebaseModules.firestoreMod.getDoc(ref);
  }

  return localDocSnapshot(ref.path);
}

async function deleteDoc(ref) {
  await initFirebaseModules();

  if (mode === 'firebase' && firebaseModules) {
    return firebaseModules.firestoreMod.deleteDoc(ref);
  }

  delete localState.docs[ref.path];
  saveLocalDb();
  notifyLocal(ref.path);
}

function onSnapshot(ref, callback) {
  if (mode === 'firebase' && firebaseModules) {
    return firebaseModules.firestoreMod.onSnapshot(ref, callback);
  }

  if (ref.type === 'collection') {
    return registerWatcher('collection', ref.path, callback);
  }

  return registerWatcher('doc', ref.path, callback);
}

export {
  app,
  db,
  auth,
  appId,
  ensureAuth,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot
};
