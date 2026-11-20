import { parsePotId, potIdToString } from './amounts';
import { normalizeAddress } from './rules';
import type { Address, ChainContext } from './types';

export type EventMetadataLocale = 'en' | 'vi';
export type EventMetadataContext = Pick<ChainContext, 'chainId' | 'coreAddress'>;

export interface EventMetadataText {
  readonly title: string;
  readonly description: string;
}

/** Descriptive copy only: never merge this into pot, token or transaction state. */
export interface EventMetadata {
  readonly version: 1;
  readonly kind: 'fictional-demo';
  readonly chainId: number;
  readonly coreAddress: Address;
  readonly potId: string;
  readonly locales: Readonly<Record<EventMetadataLocale, EventMetadataText>>;
}

const addressPattern = '^0x(?!0{40}$)[0-9a-fA-F]{40}$(?![\\s\\S])';
const potIdPattern = '^[1-9][0-9]{0,77}$(?![\\s\\S])';
// No HTML, URL syntax, controls or surrounding spaces. Unicode letters support EN/VI.
const textPattern = String.raw`^(?! )(?!.*[Ww]{3}\.)[\p{L}\p{M}\p{N} .,!?()'’–—-]*[\p{L}\p{M}\p{N}.,!?()'’–—-]$(?![\s\S])`;
const safeText = new RegExp(textPattern, 'u');
const titleLimit = 80;
const descriptionLimit = 360;
const maxJsonLength = 8192;
const fields = ['version', 'kind', 'chainId', 'coreAddress', 'potId', 'locales'] as const;
const languages = ['en', 'vi'] as const;
const textFields = ['title', 'description'] as const;
const localizedTextSchema = {
  type: 'object',
  additionalProperties: false,
  required: textFields,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: titleLimit, pattern: textPattern },
    description: { type: 'string', minLength: 1, maxLength: descriptionLimit, pattern: textPattern },
  },
} as const;

/** JSON Schema plus a runtime uint256 upper-bound check for the string potId. */
export const eventMetadataSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Curated fictional event context',
  type: 'object',
  additionalProperties: false,
  required: fields,
  properties: {
    version: { const: 1 },
    kind: { const: 'fictional-demo' },
    chainId: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    coreAddress: { type: 'string', pattern: addressPattern },
    potId: { type: 'string', minLength: 1, maxLength: 78, pattern: potIdPattern },
    locales: {
      type: 'object',
      additionalProperties: false,
      required: languages,
      properties: { en: localizedTextSchema, vi: localizedTextSchema },
    },
  },
} as const;

function hasFields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === keys.length && keys.every(key => {
    const descriptor = descriptors[key];
    return descriptor?.enumerable && 'value' in descriptor;
  });
}

function validText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit * 2 &&
    Array.from(value).length <= limit && safeText.test(value);
}

function loadText(value: unknown): EventMetadataText | null {
  if (!hasFields(value, textFields) || !validText(value.title, titleLimit) ||
      !validText(value.description, descriptionLimit)) return null;
  return Object.freeze({ title: value.title, description: value.description });
}

function validChainId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Validate local JSON data, never retrieve it. This does not detect PII or establish truth. */
export function loadEventMetadata(source: unknown): EventMetadata | null {
  try {
    if (typeof source === 'string') {
      if (source.length > maxJsonLength) return null;
      source = JSON.parse(source) as unknown;
    }
    if (!hasFields(source, fields) || source.version !== 1 || source.kind !== 'fictional-demo' ||
        !validChainId(source.chainId) || !hasFields(source.locales, languages)) return null;
    if (typeof source.coreAddress !== 'string' || source.coreAddress.length !== 42 ||
        typeof source.potId !== 'string') return null;
    const coreAddress = normalizeAddress(source.coreAddress);
    const potId = parsePotId(source.potId).toString();
    if (source.potId !== potId) return null;
    const en = loadText(source.locales.en);
    const vi = loadText(source.locales.vi);
    if (!en || !vi) return null;
    return Object.freeze({
      version: 1, kind: 'fictional-demo', chainId: source.chainId, coreAddress, potId,
      locales: Object.freeze({ en, vi }),
    });
  } catch {
    return null;
  }
}

/** Match all three identity fields; a match is not authentication or proof of pot existence. */
export function bindEventMetadata(
  source: unknown,
  context: EventMetadataContext | null,
  potId: bigint | string,
): EventMetadata | null {
  try {
    if (!context || !validChainId(context.chainId) || typeof context.coreAddress !== 'string' ||
        context.coreAddress.length !== 42) return null;
    const id = typeof potId === 'bigint' ? potIdToString(potId) : parsePotId(potId).toString();
    if (typeof potId === 'string' && potId !== id) return null;
    const metadata = loadEventMetadata(source);
    return metadata && metadata.chainId === context.chainId &&
      metadata.coreAddress === normalizeAddress(context.coreAddress) && metadata.potId === id
      ? metadata : null;
  } catch {
    return null;
  }
}
