import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Environment constraint: In dev / Cloud Run, dev server must run on port 3000.
// In Docker production, allow custom PORT if not 8080 (which is Cloud Run's reserved port).
const PORT =
  process.env.NODE_ENV === 'production' && process.env.PORT && process.env.PORT !== '8080'
    ? parseInt(process.env.PORT, 10)
    : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS headers for all incoming requests (solves any cross-origin browser issues)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, X-Vault-Token, X-Vault-Namespace, Authorization'
  );
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Helper to make requests to real Vault server with Docker container/host resolution
async function callVault(
  vaultUrl: string,
  vaultPath: string,
  token: string,
  method: string = 'GET',
  body?: any,
  namespace?: string
) {
  let cleanBase = (vaultUrl || '').trim().replace(/\/+$/, '');
  if (cleanBase && !cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
    cleanBase = `http://${cleanBase}`;
  }
  const cleanPath = (vaultPath || '').replace(/^\/+/, '');

  // Generate candidate base URLs if user specifies localhost or 127.0.0.1 in Docker
  const candidateBases: string[] = [cleanBase];
  if (cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1')) {
    const portMatch = cleanBase.match(/:(\d+)$/);
    const port = portMatch ? portMatch[1] : '8200';
    // Add Docker Compose service name alias
    candidateBases.push(`http://vault-dev:${port}`);
    // Add host gateway alias
    candidateBases.push(`http://host.docker.internal:${port}`);
    // Add default docker bridge host IP
    candidateBases.push(`http://172.17.0.1:${port}`);
  }

  const headers: Record<string, string> = {
    'X-Vault-Token': token,
    'Content-Type': 'application/json',
  };

  if (namespace) {
    headers['X-Vault-Namespace'] = namespace;
  }

  let lastError: any = null;

  for (const base of candidateBases) {
    const url = `${base}/v1/${cleanPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout per candidate for responsive failure

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      return {
        status: response.status,
        ok: response.ok,
        data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      // Try next candidate in loop
    }
  }

  const isLocalhost = cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1');
  const errorMsg = isLocalhost
    ? "Vault'a erişilemedi. Docker konteyneri içerisindeyken aynı compose'daki Vault için 'http://vault-dev:8200', veya ana sunucu (host) Vault'u için 'http://host.docker.internal:8200' kullanabilirsiniz."
    : (lastError?.name === 'AbortError' ? 'Bağlantı zaman aşımına uğradı' : (lastError?.message || 'Vault sunucusuna ulaşılamadı'));

  return {
    status: 0,
    ok: false,
    error: errorMsg,
  };
}

// 1. Vault test connection
app.post('/api/vault/test-connection', async (req: Request, res: Response) => {
  const { url, token, namespace } = req.body;
  if (!url || !token) {
    res.status(400).json({ success: false, message: 'URL ve Token gereklidir.' });
    return;
  }

  // Check self lookup
  const result = await callVault(url, 'auth/token/lookup-self', token, 'GET', undefined, namespace);
  if (!result.ok) {
    // Try health check
    const healthResult = await callVault(url, 'sys/health', token, 'GET', undefined, namespace);
    if (!healthResult.ok && healthResult.status === 0) {
      res.status(502).json({
        success: false,
        message: `Sunucuya erişilemiyor: ${result.error || 'Ağ hatası veya güvenlik duvarı/VPN engeli.'}`,
        details: result.error,
      });
      return;
    }

    res.status(result.status || 401).json({
      success: false,
      message: 'Token doğrulanamadı veya yetkisiz (401/403).',
      raw: result.data,
    });
    return;
  }

  const tokenData = result.data?.data || {};
  res.json({
    success: true,
    displayName: tokenData.display_name || 'vault-token',
    policies: tokenData.policies || [],
    ttl: tokenData.ttl,
    renewable: tokenData.renewable,
  });
});

// 2. Secret engines list
app.post('/api/vault/engines', async (req: Request, res: Response) => {
  const { url, token, namespace } = req.body;
  const result = await callVault(url, 'sys/mounts', token, 'GET', undefined, namespace);

  if (!result.ok) {
    res.json({
      success: false,
      engines: ['asis', 'secret', 'secrets'],
      message: result.status === 403 
        ? "Token'ın engine listeleme (sys/mounts) yetkisi yok. Varsayılan engine listesi sağlandı."
        : `Engine listesi alınamadı: ${result.error || 'Yetki hatası'}`
    });
    return;
  }

  const mounts = result.data?.data || result.data || {};
  const kvEngines: Array<{ path: string; type: string; description: string; version: string }> = [];

  for (const [key, value] of Object.entries<any>(mounts)) {
    if (value && typeof value === 'object' && value.type === 'kv') {
      const cleanPath = key.replace(/\/+$/, '');
      const version = value.options?.version || '2';
      kvEngines.push({
        path: cleanPath,
        type: 'kv',
        description: value.description || '',
        version,
      });
    }
  }

  if (kvEngines.length === 0) {
    kvEngines.push(
      { path: 'asis', type: 'kv', description: 'Varsayılan ASIS Engine', version: '2' },
      { path: 'secret', type: 'kv', description: 'Varsayılan Secret Engine', version: '2' }
    );
  }

  res.json({
    success: true,
    engines: kvEngines.map(e => e.path),
    engineDetails: kvEngines,
  });
});

// Helper to query list keys from Vault
async function vaultListDirect(
  url: string,
  engine: string,
  path: string,
  token: string,
  namespace?: string
): Promise<string[]> {
  const cleanPath = path ? path.replace(/^\/+|\/+$/g, '') : '';
  const v2ListUrl = cleanPath ? `${engine}/metadata/${cleanPath}?list=true` : `${engine}/metadata?list=true`;
  const result = await callVault(url, v2ListUrl, token, 'GET', undefined, namespace);
  if (result.ok && result.data?.data?.keys && Array.isArray(result.data.data.keys)) {
    return result.data.data.keys;
  }
  const v1ListUrl = cleanPath ? `${engine}/${cleanPath}?list=true` : `${engine}?list=true`;
  const v1Result = await callVault(url, v1ListUrl, token, 'GET', undefined, namespace);
  if (v1Result.ok && v1Result.data?.data?.keys && Array.isArray(v1Result.data.data.keys)) {
    return v1Result.data.data.keys;
  }
  return [];
}

// 3. List secrets at a path (KV v2 metadata list or KV v1 list)
app.post('/api/vault/list', async (req: Request, res: Response) => {
  const { url, token, engine = 'asis', path = '', namespace } = req.body;
  const cleanPath = path ? path.replace(/^\/+|\/+$/g, '') : '';

  // KV v2 uses /v1/{engine}/metadata/{path}?list=true
  const v2ListUrl = cleanPath ? `${engine}/metadata/${cleanPath}?list=true` : `${engine}/metadata?list=true`;
  const result = await callVault(url, v2ListUrl, token, 'GET', undefined, namespace);

  if (result.ok && result.data?.data?.keys) {
    res.json({
      success: true,
      keys: result.data.data.keys,
      version: 'v2',
    });
    return;
  }

  // Fallback to KV v1 style: {engine}/{path}?list=true
  const v1ListUrl = cleanPath ? `${engine}/${cleanPath}?list=true` : `${engine}?list=true`;
  const v1Result = await callVault(url, v1ListUrl, token, 'GET', undefined, namespace);

  if (v1Result.ok && v1Result.data?.data?.keys) {
    res.json({
      success: true,
      keys: v1Result.data.data.keys,
      version: 'v1',
    });
    return;
  }

  // If path simply doesn't exist (404), return empty keys gracefully with 200 OK
  if (result.status === 404 || v1Result.status === 404) {
    res.json({
      success: true,
      notFound: true,
      keys: [],
      message: 'Dizin bulunamadı veya henüz anahtar yok.',
    });
    return;
  }

  res.status(result.status || 500).json({
    success: false,
    message: result.data?.errors?.[0] || result.error || 'Dizin bulunamadı veya anahtar listelenemedi.',
    keys: [],
  });
});

// 4. Read secret (data + metadata)
app.post('/api/vault/read', async (req: Request, res: Response) => {
  const { url, token, engine = 'asis', path = '', version, namespace } = req.body;
  const cleanPath = path.replace(/^\/+|\/+$/g, '');

  let v2DataUrl = `${engine}/data/${cleanPath}`;
  if (version) {
    v2DataUrl += `?version=${version}`;
  }

  const result = await callVault(url, v2DataUrl, token, 'GET', undefined, namespace);

  if (result.ok && result.data?.data) {
    // KV v2 returns data: { data: {...}, metadata: {...} }
    const secretData = result.data.data.data || {};
    const metadata = result.data.data.metadata || {};

    // Also fetch metadata history if available
    const metaResult = await callVault(url, `${engine}/metadata/${cleanPath}`, token, 'GET', undefined, namespace);
    const fullMetadata = metaResult.ok ? metaResult.data?.data : null;
    const trueCurrentVersion = fullMetadata?.current_version || metadata.version || 1;
    const requestedVersion = version ? Number(version) : (metadata.version || trueCurrentVersion);

    res.json({
      success: true,
      data: secretData,
      metadata: fullMetadata || metadata,
      currentVersion: trueCurrentVersion,
      selectedVersion: requestedVersion,
      isV2: true,
    });
    return;
  }

  // Try KV v1 read
  const v1Result = await callVault(url, `${engine}/${cleanPath}`, token, 'GET', undefined, namespace);
  if (v1Result.ok && v1Result.data?.data) {
    res.json({
      success: true,
      data: v1Result.data.data,
      metadata: { current_version: 1 },
      currentVersion: 1,
      isV2: false,
    });
    return;
  }

  // Return 200 with notFound: true instead of throwing 404 network error in browser console
  if (result.status === 404 || v1Result.status === 404) {
    res.json({
      success: false,
      notFound: true,
      message: 'Secret bu yolda henüz mevcut değil (404 Not Found).',
    });
    return;
  }

  res.status(result.status || 500).json({
    success: false,
    message: result.data?.errors?.[0] || result.error || 'Secret okunamadı.',
  });
});

// 4.5 Discover all applications and cities across all environments and candidate engines in Vault
app.post('/api/vault/discover', async (req: Request, res: Response) => {
  const { url, token, engine = 'asis', namespace, env = 'prod' } = req.body;
  if (!url || !token) {
    res.status(400).json({ success: false, message: 'URL ve Token gereklidir.' });
    return;
  }

  const candidateEngines = Array.from(new Set([engine, 'secret', 'asis', 'secrets'].filter(Boolean)));
  const discoveredApps = new Set<string>();
  const discoveredCities = new Set<string>();
  const appCitiesMap: Record<string, Set<string>> = {};
  const envAppCitiesMap: Record<string, Record<string, Set<string>>> = {};
  let activeEngine = engine;

  for (const eng of candidateEngines) {
    try {
      // 1. Inspect engine root
      const rootKeys = await vaultListDirect(url, eng, '', token, namespace);
      const envsToCheck = new Set<string>([env, 'prod', 'test', 'dev'].filter(Boolean));

      for (const rk of rootKeys) {
        const cleanRk = rk.replace(/\/$/, '');
        if (['prod', 'test', 'dev'].includes(cleanRk.toLowerCase())) {
          envsToCheck.add(cleanRk);
        } else if (cleanRk.startsWith('apps-')) {
          const cityLower = cleanRk.toLowerCase();
          discoveredCities.add(cityLower);
          const appKeys = await vaultListDirect(url, eng, cleanRk, token, namespace);
          for (const ak of appKeys) {
            const app = ak.replace(/\/$/, '');
            if (app && app !== cleanRk.replace(/^apps-/, '') && !app.endsWith('.json')) {
              discoveredApps.add(app);
              if (!appCitiesMap[app]) appCitiesMap[app] = new Set();
              appCitiesMap[app].add(cityLower);
            }
          }
        }
      }

      // 2. Inspect environments: prod, test, dev, etc.
      for (const envFolder of envsToCheck) {
        const envKeys = await vaultListDirect(url, eng, envFolder, token, namespace);
        for (const ek of envKeys) {
          const cleanEk = ek.replace(/\/$/, '');
          if (cleanEk.startsWith('apps-')) {
            const cityLower = cleanEk.toLowerCase();
            discoveredCities.add(cityLower);

            // e.g. prod/apps-tekirdag -> list to get application names inside this city!
            const appKeys = await vaultListDirect(url, eng, `${envFolder}/${cleanEk}`, token, namespace);
            for (const ak of appKeys) {
              const app = ak.replace(/\/$/, '');
              if (app && app !== cleanEk.replace(/^apps-/, '') && !app.endsWith('.json')) {
                discoveredApps.add(app);

                if (!appCitiesMap[app]) appCitiesMap[app] = new Set();
                appCitiesMap[app].add(cityLower);

                if (!envAppCitiesMap[envFolder]) envAppCitiesMap[envFolder] = {};
                if (!envAppCitiesMap[envFolder][app]) envAppCitiesMap[envFolder][app] = new Set();
                envAppCitiesMap[envFolder][app].add(cityLower);
              }
            }
          } else if (cleanEk) {
            // E.g. prod/afc-saas-api
            const subKeys = await vaultListDirect(url, eng, `${envFolder}/${cleanEk}`, token, namespace);
            if (subKeys.length > 0) {
              if (!['apps', 'user', 'users'].includes(cleanEk)) {
                discoveredApps.add(cleanEk);
              }
              for (const sk of subKeys) {
                const cleanSk = sk.replace(/\/$/, '').toLowerCase();
                if (cleanSk.startsWith('apps-')) {
                  discoveredCities.add(cleanSk);

                  if (!appCitiesMap[cleanEk]) appCitiesMap[cleanEk] = new Set();
                  appCitiesMap[cleanEk].add(cleanSk);

                  if (!envAppCitiesMap[envFolder]) envAppCitiesMap[envFolder] = {};
                  if (!envAppCitiesMap[envFolder][cleanEk]) envAppCitiesMap[envFolder][cleanEk] = new Set();
                  envAppCitiesMap[envFolder][cleanEk].add(cleanSk);
                }
              }
            }
          }
        }
      }

      if (discoveredApps.size > 0 || discoveredCities.size > 0) {
        activeEngine = eng;
        break; // Found our primary active engine!
      }
    } catch {
      // Try next engine
    }
  }

  // Only provide default fallback if NOTHING was discovered in Vault (e.g. empty Vault)
  if (discoveredApps.size === 0 && discoveredCities.size === 0) {
    discoveredApps.add('afc-saas-api');
    discoveredCities.add('apps-tekirdag');
    appCitiesMap['afc-saas-api'] = new Set(['apps-tekirdag']);
  }

  // Serialize sets to sorted arrays
  const serializedAppCitiesMap: Record<string, string[]> = {};
  for (const [app, cities] of Object.entries(appCitiesMap)) {
    serializedAppCitiesMap[app] = Array.from(cities).sort();
  }

  const serializedEnvAppCitiesMap: Record<string, Record<string, string[]>> = {};
  for (const [e, aMap] of Object.entries(envAppCitiesMap)) {
    serializedEnvAppCitiesMap[e] = {};
    for (const [app, cities] of Object.entries(aMap)) {
      serializedEnvAppCitiesMap[e][app] = Array.from(cities).sort();
    }
  }

  res.json({
    success: true,
    engine: activeEngine,
    apps: Array.from(discoveredApps).sort(),
    cities: Array.from(discoveredCities).sort(),
    appCitiesMap: serializedAppCitiesMap,
    envAppCitiesMap: serializedEnvAppCitiesMap,
  });
});

// 4.6 List all files under apps-*/{appName}/ across the environment
app.post('/api/vault/app-files', async (req: Request, res: Response) => {
  const { url, token, engine = 'asis', env = 'prod', appName, namespace } = req.body;
  if (!url || !token || !appName) {
    res.status(400).json({ success: false, message: 'URL, Token ve Uygulama Adı gereklidir.' });
    return;
  }

  try {
    const files: Array<{
      id: string;
      fileName: string;
      appsFolder: string;
      path: string;
      displayName: string;
    }> = [];

    // 1. List keys in env folder (e.g. 'prod')
    const envKeys = await vaultListDirect(url, engine, env, token, namespace);

    for (const ek of envKeys) {
      const cleanEk = ek.replace(/\/$/, '');
      if (cleanEk.startsWith('apps-')) {
        // E.g. cleanEk = "apps-tekirdag"
        // List inside `${env}/${cleanEk}/${appName}`
        const appFolderKeys = await vaultListDirect(url, engine, `${env}/${cleanEk}/${appName}`, token, namespace);
        for (const fk of appFolderKeys) {
          const fileName = fk.replace(/\/$/, '');
          if (fileName) {
            files.push({
              id: `${cleanEk}/${fileName}`,
              fileName: fileName,
              appsFolder: cleanEk,
              path: `${env}/${cleanEk}/${appName}/${fileName}`,
              displayName: `${fileName} (${cleanEk})`,
            });
          }
        }
      } else if (cleanEk === appName) {
        // Direct pattern: ${env}/${appName}
        const directKeys = await vaultListDirect(url, engine, `${env}/${cleanEk}`, token, namespace);
        for (const fk of directKeys) {
          const fileName = fk.replace(/\/$/, '');
          if (fileName && !fileName.startsWith('apps-')) {
            files.push({
              id: `${cleanEk}/${fileName}`,
              fileName: fileName,
              appsFolder: '',
              path: `${env}/${cleanEk}/${fileName}`,
              displayName: fileName,
            });
          }
        }
      }
    }

    res.json({
      success: true,
      files,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Dosyalar listelenemedi.',
      files: [],
    });
  }
});

// 5. Create / Update secret (writes new version in KV v2)
app.post('/api/vault/write', async (req: Request, res: Response) => {
  const { url, token, engine = 'asis', path = '', data = {}, cas, namespace } = req.body;
  const cleanPath = path.replace(/^\/+|\/+$/g, '');

  // KV v2 payload format: { data: { ... }, options: { cas: number } }
  const payload: any = {
    data: data,
  };
  if (cas !== undefined && cas !== null) {
    payload.options = { cas };
  }

  const result = await callVault(url, `${engine}/data/${cleanPath}`, token, 'POST', payload, namespace);

  if (result.ok) {
    const meta = result.data?.data || {};
    res.json({
      success: true,
      message: 'Secret başarıyla kaydedildi (Yeni versiyon oluşturuldu).',
      version: meta.version,
      created_time: meta.created_time,
    });
    return;
  }

  // Try v1 write if v2 failed with 404
  if (result.status === 404) {
    const v1Result = await callVault(url, `${engine}/${cleanPath}`, token, 'POST', data, namespace);
    if (v1Result.ok) {
      res.json({
        success: true,
        message: 'Secret KV v1 formatında kaydedildi.',
        version: 1,
      });
      return;
    }
  }

  res.status(result.status || 400).json({
    success: false,
    message: result.data?.errors?.[0] || result.error || 'Secret kaydedilemedi.',
  });
});

// 6. Delete secret / soft delete / destroy version
app.post('/api/vault/delete', async (req: Request, res: Response) => {
  const { url, token, engine = 'asis', path = '', versions, permanent = false, namespace } = req.body;
  const cleanPath = path.replace(/^\/+|\/+$/g, '');

  if (permanent) {
    // Delete metadata and all versions permanently
    const result = await callVault(url, `${engine}/metadata/${cleanPath}`, token, 'DELETE', undefined, namespace);
    if (result.ok || result.status === 204) {
      res.json({ success: true, message: 'Secret ve tüm versiyonları kalıcı olarak silindi.' });
      return;
    }
  }

  if (versions && versions.length > 0) {
    // Destroy specific versions
    const result = await callVault(
      url,
      `${engine}/destroy/${cleanPath}`,
      token,
      'POST',
      { versions },
      namespace
    );
    if (result.ok || result.status === 204) {
      res.json({ success: true, message: `Versiyonlar (${versions.join(', ')}) imha edildi.` });
      return;
    }
  }

  // Soft delete latest / data
  const result = await callVault(url, `${engine}/data/${cleanPath}`, token, 'DELETE', undefined, namespace);
  if (result.ok || result.status === 204) {
    res.json({ success: true, message: 'Secret silindi (KV v2 soft delete).' });
    return;
  }

  res.status(result.status || 400).json({
    success: false,
    message: result.data?.errors?.[0] || result.error || 'Silme işlemi başarısız.',
  });
});

// Setup Vite middlewares in development or static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vault Manager Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
});
