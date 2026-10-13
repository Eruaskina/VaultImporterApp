export interface KeyValueItem {
  id: string;
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'null';
  isSensitive: boolean;
}

/**
 * Checks if a key represents a sensitive value (password, connection string, secret, etc.)
 */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes('pass') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.includes('key') ||
    lower.includes('connectionstring') ||
    lower.includes('pwd') ||
    lower.includes('credential') ||
    lower.includes('auth') ||
    lower.includes('cert')
  );
}

/**
 * Parses raw Vault secret data.
 * If data contains an "appsettings" key which is an object or JSON string,
 * it extracts that inner content for editing while remembering the wrapper.
 */
export function extractConfigData(rawVaultData: Record<string, any>): {
  targetData: any;
  hasAppsettingsWrapper: boolean;
  wrapperIsJsonString: boolean;
} {
  if (!rawVaultData || typeof rawVaultData !== 'object') {
    return { targetData: {}, hasAppsettingsWrapper: false, wrapperIsJsonString: false };
  }

  if ('appsettings' in rawVaultData) {
    const appsettingsVal = rawVaultData.appsettings;
    if (typeof appsettingsVal === 'string') {
      try {
        const parsed = JSON.parse(appsettingsVal);
        return { targetData: parsed, hasAppsettingsWrapper: true, wrapperIsJsonString: true };
      } catch {
        // Just a string
        return { targetData: { appsettings: appsettingsVal }, hasAppsettingsWrapper: false, wrapperIsJsonString: false };
      }
    } else if (typeof appsettingsVal === 'object' && appsettingsVal !== null) {
      return { targetData: appsettingsVal, hasAppsettingsWrapper: true, wrapperIsJsonString: false };
    }
  }

  return { targetData: rawVaultData, hasAppsettingsWrapper: false, wrapperIsJsonString: false };
}

/**
 * Flattens an object into sequential Key-Value rows using the given separator (default ':').
 * Example:
 * { Logging: { LogLevel: { Default: "Information" } } }
 * becomes:
 * [ { key: "Logging:LogLevel:Default", value: "Information", type: "string" } ]
 */
export function flattenToKeyValues(
  obj: any,
  separator: string = ':',
  prefix: string = ''
): KeyValueItem[] {
  if (obj === null || obj === undefined) {
    return [];
  }

  // If primitive at root
  if (typeof obj !== 'object') {
    return [
      {
        id: Math.random().toString(36).substring(2, 9),
        key: prefix || 'value',
        value: obj,
        type: typeof obj as any,
        isSensitive: isSensitiveKey(prefix),
      },
    ];
  }

  const items: KeyValueItem[] = [];

  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}${separator}${k}` : k;

    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // Recursively flatten nested objects
      const childItems = flattenToKeyValues(v, separator, fullKey);
      if (childItems.length === 0) {
        // Empty object
        items.push({
          id: Math.random().toString(36).substring(2, 9),
          key: fullKey,
          value: '{}',
          type: 'string',
          isSensitive: isSensitiveKey(fullKey),
        });
      } else {
        items.push(...childItems);
      }
    } else if (Array.isArray(v)) {
      // Arrays: flatten with indices
      if (v.length === 0) {
        items.push({
          id: Math.random().toString(36).substring(2, 9),
          key: fullKey,
          value: '[]',
          type: 'string',
          isSensitive: isSensitiveKey(fullKey),
        });
      } else {
        v.forEach((arrItem, index) => {
          const arrKey = `${fullKey}[${index}]`;
          if (arrItem !== null && typeof arrItem === 'object') {
            items.push(...flattenToKeyValues(arrItem, separator, arrKey));
          } else {
            items.push({
              id: Math.random().toString(36).substring(2, 9),
              key: arrKey,
              value: arrItem,
              type: arrItem === null ? 'null' : (typeof arrItem as any),
              isSensitive: isSensitiveKey(arrKey),
            });
          }
        });
      }
    } else {
      // Primitive value
      items.push({
        id: Math.random().toString(36).substring(2, 9),
        key: fullKey,
        value: v,
        type: v === null ? 'null' : (typeof v as any),
        isSensitive: isSensitiveKey(fullKey),
      });
    }
  }

  return items;
}

/**
 * Reconstructs a nested JSON object from flat Key-Value items.
 */
export function unflattenKeyValues(
  items: KeyValueItem[],
  separator: string = ':',
  hasAppsettingsWrapper: boolean = false,
  wrapperIsJsonString: boolean = false
): Record<string, any> {
  const root: Record<string, any> = {};

  for (const item of items) {
    if (!item.key || !item.key.trim()) continue;

    const path = item.key.trim();
    // Parse typed value
    let val: any = item.value;
    if (item.type === 'number') {
      const num = Number(item.value);
      val = isNaN(num) ? item.value : num;
    } else if (item.type === 'boolean') {
      val = typeof item.value === 'boolean' ? item.value : String(item.value).toLowerCase() === 'true';
    } else if (item.type === 'null') {
      val = null;
    }

    // Split path by separator (taking care not to break array indices e.g. Arr[0])
    const parts = path.split(separator);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      // Check if part has array notation e.g. "Items[0]"
      const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const propName = arrayMatch[1];
        const arrayIdx = parseInt(arrayMatch[2], 10);

        if (!current[propName]) {
          current[propName] = [];
        }
        if (!Array.isArray(current[propName])) {
          current[propName] = [];
        }

        if (isLast) {
          current[propName][arrayIdx] = val;
        } else {
          if (!current[propName][arrayIdx]) {
            current[propName][arrayIdx] = {};
          }
          current = current[propName][arrayIdx];
        }
      } else {
        if (isLast) {
          current[part] = val;
        } else {
          if (!current[part] || typeof current[part] !== 'object') {
            current[part] = {};
          }
          current = current[part];
        }
      }
    }
  }

  if (hasAppsettingsWrapper) {
    return {
      appsettings: wrapperIsJsonString ? JSON.stringify(root) : root,
    };
  }

  return root;
}

/**
 * Aggregates secrets from multiple cities into flat Key-Value rows with multi-value detection.
 */
export function aggregateSecretsKeys(
  citySecrets: { city: string; data: Record<string, any> }[],
  separator: string = ':'
): import('../types/vault').AggregatedKeyRow[] {
  const map: Record<
    string,
    {
      cityValues: Record<string, any>;
      presentInCities: string[];
      types: Set<string>;
    }
  > = {};

  for (const { city, data } of citySecrets) {
    if (!data) continue;
    const { targetData } = extractConfigData(data);
    const flatItems = flattenToKeyValues(targetData, separator);

    for (const item of flatItems) {
      if (!map[item.key]) {
        map[item.key] = {
          cityValues: {},
          presentInCities: [],
          types: new Set(),
        };
      }
      map[item.key].cityValues[city] = item.value;
      if (!map[item.key].presentInCities.includes(city)) {
        map[item.key].presentInCities.push(city);
      }
      map[item.key].types.add(item.type);
    }
  }

  const result: import('../types/vault').AggregatedKeyRow[] = [];

  for (const [key, info] of Object.entries(map)) {
    // Collect unique serialized values to accurately detect multi-values
    const serializedSet = new Set<string>();
    const uniqueValues: any[] = [];

    for (const val of Object.values(info.cityValues)) {
      const ser = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (!serializedSet.has(ser)) {
        serializedSet.add(ser);
        uniqueValues.push(val);
      }
    }

    const typeArray = Array.from(info.types);
    const dominantType = (typeArray[0] || 'string') as any;

    result.push({
      key,
      uniqueValues,
      hasMultipleValues: uniqueValues.length > 1,
      cityValues: info.cityValues,
      presentInCities: info.presentInCities,
      type: dominantType,
    });
  }

  // Sort alphabetically by key
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Applies deletion of key(s) to a secret's raw data and reconstructs it.
 */
export function applyDeleteKeysToSecretData(
  rawVaultData: Record<string, any>,
  keysToDelete: string[],
  separator: string = ':'
): Record<string, any> {
  const { targetData, hasAppsettingsWrapper, wrapperIsJsonString } = extractConfigData(rawVaultData);
  const flatItems = flattenToKeyValues(targetData, separator);

  const deleteSet = new Set(keysToDelete);
  const filtered = flatItems.filter((item) => {
    if (deleteSet.has(item.key)) return false;
    // Also remove children of deleted parent paths
    for (const del of keysToDelete) {
      if (item.key.startsWith(`${del}${separator}`)) return false;
    }
    return true;
  });

  return unflattenKeyValues(filtered, separator, hasAppsettingsWrapper, wrapperIsJsonString);
}

/**
 * Adds or updates key-value pairs in a secret's raw data.
 */
export function applyAddKeysToSecretData(
  rawVaultData: Record<string, any>,
  newKeyValues: { key: string; value: any; type?: string }[],
  separator: string = ':'
): Record<string, any> {
  const { targetData, hasAppsettingsWrapper, wrapperIsJsonString } = extractConfigData(rawVaultData);
  const flatItems = flattenToKeyValues(targetData, separator);

  for (const newItem of newKeyValues) {
    if (!newItem.key || !newItem.key.trim()) continue;
    const cleanKey = newItem.key.trim();
    const existingIndex = flatItems.findIndex((it) => it.key === cleanKey);

    let parsedVal = newItem.value;
    const itemType = (newItem.type || typeof parsedVal) as any;

    if (itemType === 'number') {
      const n = Number(parsedVal);
      parsedVal = isNaN(n) ? parsedVal : n;
    } else if (itemType === 'boolean') {
      parsedVal = typeof parsedVal === 'boolean' ? parsedVal : String(parsedVal).toLowerCase() === 'true';
    } else if (itemType === 'null') {
      parsedVal = null;
    }

    const kvItem: KeyValueItem = {
      id: Math.random().toString(36).substring(2, 9),
      key: cleanKey,
      value: parsedVal,
      type: itemType,
      isSensitive: isSensitiveKey(cleanKey),
    };

    if (existingIndex >= 0) {
      flatItems[existingIndex] = kvItem;
    } else {
      flatItems.push(kvItem);
    }
  }

  return unflattenKeyValues(flatItems, separator, hasAppsettingsWrapper, wrapperIsJsonString);
}

/**
 * Updates the value of a key in a secret's raw data.
 */
export function applyUpdateValueToSecretData(
  rawVaultData: Record<string, any>,
  key: string,
  newValue: any,
  newType?: string,
  separator: string = ':'
): Record<string, any> {
  const { targetData, hasAppsettingsWrapper, wrapperIsJsonString } = extractConfigData(rawVaultData);
  const flatItems = flattenToKeyValues(targetData, separator);

  let parsedVal = newValue;
  const itemType = (newType || typeof parsedVal) as any;
  if (itemType === 'number') {
    const n = Number(parsedVal);
    parsedVal = isNaN(n) ? parsedVal : n;
  } else if (itemType === 'boolean') {
    parsedVal = typeof parsedVal === 'boolean' ? parsedVal : String(parsedVal).toLowerCase() === 'true';
  } else if (itemType === 'null') {
    parsedVal = null;
  }

  const existingIndex = flatItems.findIndex((it) => it.key === key);
  if (existingIndex >= 0) {
    flatItems[existingIndex] = {
      ...flatItems[existingIndex],
      value: parsedVal,
      type: itemType,
    };
  } else {
    flatItems.push({
      id: Math.random().toString(36).substring(2, 9),
      key,
      value: parsedVal,
      type: itemType,
      isSensitive: isSensitiveKey(key),
    });
  }

  return unflattenKeyValues(flatItems, separator, hasAppsettingsWrapper, wrapperIsJsonString);
}

/**
 * Renames a key (and all its nested children if any) across a secret's raw data.
 */
export function applyRenameKeyToSecretData(
  rawVaultData: Record<string, any>,
  oldKey: string,
  newKey: string,
  separator: string = ':'
): Record<string, any> {
  const { targetData, hasAppsettingsWrapper, wrapperIsJsonString } = extractConfigData(rawVaultData);
  const flatItems = flattenToKeyValues(targetData, separator);

  const updatedItems = flatItems.map((item) => {
    if (item.key === oldKey) {
      return {
        ...item,
        key: newKey,
        isSensitive: isSensitiveKey(newKey),
      };
    }
    if (item.key.startsWith(`${oldKey}${separator}`)) {
      const suffix = item.key.slice(oldKey.length);
      const replacedKey = `${newKey}${suffix}`;
      return {
        ...item,
        key: replacedKey,
        isSensitive: isSensitiveKey(replacedKey),
      };
    }
    return item;
  });

  return unflattenKeyValues(updatedItems, separator, hasAppsettingsWrapper, wrapperIsJsonString);
}
