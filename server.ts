import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
  const cleanBase = vaultUrl.replace(/\/+$/, '');
  const cleanPath = vaultPath.replace(/^\/+/, '');

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
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout per candidate

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

  res.status(result.status || 404).json({
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

  res.status(result.status || 404).json({
    success: false,
    message: result.data?.errors?.[0] || result.error || 'Secret okunamadı.',
  });
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
      server: { middlewareMode: true },
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
