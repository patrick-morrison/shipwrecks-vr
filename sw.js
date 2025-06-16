const CACHE_NAME = 'shipwrecks-vr-v1.2';
const CACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  // Models
  './models/kxi.glb',
  './models/alextbrown.glb',
  './models/applecrossbarge.glb',
  './models/dentonholme.glb',
  './models/key_biscayne.glb',
  './models/mayfield.glb',
  './models/pointwalter.glb',
  './models/sesa.glb',
  './models/unknown.glb',
  // Audio
  './sound/dpv.ogg',
  './sound/dpvhigh.ogg',
  './sound/vrambience.ogg',
  // Three.js CDN resources (these will be cached on first load)
  'https://cdn.jsdelivr.net/npm/three@0.177.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/loaders/DRACOLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/loaders/KTX2Loader.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/libs/meshopt_decoder.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/webxr/VRButton.js',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/webxr/XRControllerModelFactory.js'
];

// Draco and Basis decoder files (these will be cached on demand)
const DECODER_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/libs/draco/',
  'https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/libs/basis/'
];

self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching app shell and models...');
        // Cache local files first (most important)
        const localFiles = CACHE_URLS.filter(url => !url.startsWith('https://'));
        return cache.addAll(localFiles)
          .then(() => {
            console.log('✅ Local files cached successfully');
            // Then cache CDN resources
            const cdnFiles = CACHE_URLS.filter(url => url.startsWith('https://'));
            return Promise.allSettled(
              cdnFiles.map(url => 
                fetch(url).then(response => {
                  if (response.ok) {
                    return cache.put(url, response);
                  }
                  throw new Error(`Failed to fetch ${url}`);
                }).catch(err => {
                  console.warn(`⚠️ Failed to cache ${url}:`, err);
                })
              )
            );
          });
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('❌ Service Worker: Installation failed:', err);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Activation complete');
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle Draco/Basis decoder files with special caching strategy
  if (url.pathname.includes('/draco/') || url.pathname.includes('/basis/')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          // Cache decoder files on first request
          return fetch(event.request).then(response => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          });
        })
        .catch(() => {
          console.warn('⚠️ Decoder file unavailable offline:', event.request.url);
          return new Response('Decoder unavailable offline', { status: 503 });
        })
    );
    return;
  }
  
  // Standard cache-first strategy for all other requests
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Found in cache
          return response;
        }
        
        // Not in cache, try to fetch from network
        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response for caching
          const responseToCache = response.clone();
          
          // Add to cache for future requests
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
      .catch(() => {
        // Offline and not in cache
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('Content unavailable offline', { 
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Handle background sync for when the app comes back online
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Update cache with any new content
      caches.open(CACHE_NAME).then(cache => {
        console.log('🔄 Background sync: Updating cache...');
        return Promise.allSettled(
          CACHE_URLS.map(url => 
            fetch(url).then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            }).catch(err => {
              console.warn(`⚠️ Background sync failed for ${url}:`, err);
            })
          )
        );
      })
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'content-sync') {
    event.waitUntil(
      console.log('📅 Periodic sync: Checking for updates...')
      // Could implement update checking here
    );
  }
});

// Handle push notifications (for future updates)
self.addEventListener('push', event => {
  if (event.data) {
    const options = {
      body: event.data.text(),
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };
    
    event.waitUntil(
      self.registration.showNotification('Shipwrecks VR Update', options)
    );
  }
});

// Show install prompt for better UX
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('🌊 Shipwrecks VR Service Worker loaded successfully');
