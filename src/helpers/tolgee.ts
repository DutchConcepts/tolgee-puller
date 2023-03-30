// external
import decompress from 'decompress';
import fetch from 'node-fetch';
import { isPresent } from 'ts-is-present';

// helpers
import { writeResourceFile } from './file';

// types
import { Resources } from '../types/Resources';

type Options = {
  apiKey: string;
  apiUrl: string;
  languages: string[];
  namespaces: string[];
  defaultNamespace: string | null;
  prettier: boolean;
  outputPath: string;
};

type ApiOptions = Pick<Options, 'apiKey' | 'apiUrl'>;

/**
 * Creates a query string for multi-value filters.
 */
function parseMultiValueFilter(filter: string, values: string[]) {
  return `${filter}=${values.join(`&${filter}=`)}`;
}

function parseLanguages(languages: string[]) {
  if (!languages.length) {
    return null;
  }

  return `languages=${languages.join(',')}`;
}

function parseQueryParams(languages: string[], namespaces: string[]) {
  const values = [
    parseLanguages(languages),
    parseMultiValueFilter('filterNamespace', namespaces),
  ].filter(isPresent);

  let queryStr = '?';

  values.forEach((value, index) => {
    if (index > 0) {
      queryStr += '&';
    }

    queryStr += `${value}`;
  });

  return queryStr;
}

/**
 * Check if a value is an object and contains a property.
 */
function isObjectWithProp(
  value: unknown,
  key: string
): value is Record<typeof key, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

/**
 * Fetch from the Tolgee API.
 */
async function tolgeeApi(path: string, { apiUrl, apiKey }: ApiOptions) {
  const response = await fetch(`${apiUrl}/v2${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response;
}

/**
 * Get zip with locale files in namespace folder structure.
 */
async function fetchTranslationsZip(options: Options) {
  const { languages, namespaces } = options;

  // We parse the filters to: '?filterNamespace=[value]&filterNamespace=[value]
  const queryParams = parseQueryParams(languages, namespaces);

  const response = await tolgeeApi(`/projects/export${queryParams}`, options);

  // We want to work with buffers so we can use the `decompress` package.
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));

  return buffer;
}

/**
 * Throws an `Error` if we are tying to fetch the wrong languages.
 */
async function validateLanguages(
  languages: string[],
  options: ApiOptions
): Promise<void> {
  const result = await tolgeeApi('/projects/languages', options);
  const data = await result.json();

  if (
    isObjectWithProp(data, '_embedded') &&
    isObjectWithProp(data._embedded, 'languages')
  ) {
    const tolgeeLanguages = data?._embedded?.languages;

    if (Array.isArray(tolgeeLanguages)) {
      const tolgeeLanguageTags = tolgeeLanguages.map(({ tag }) => tag);

      const valid = languages.every((language) => {
        return tolgeeLanguageTags.includes(language);
      });

      if (valid) {
        return;
      }

      throw new Error(
        `Failed trying to fetch non-existing language. ${JSON.stringify(data)}`
      );
    }
  }

  throw new Error(`Failed retrieving languages. ${JSON.stringify(data)}`);
}

/**
 * Merges all the translation files into a single string.
 */
export function mergeTranslations(
  languages: string[],
  files: decompress.File[],
  defaultNamespace: string | null
) {
  const resources: Resources = languages.reduce((preVal, value) => {
    return { ...preVal, [value]: {} };
  }, {});

  const isValidDefaultNamespace =
    !!defaultNamespace && defaultNamespace.length > 0;

  files.forEach(({ path, data }) => {
    const [namespace, filename] = path.split('/');
    const [language] = filename.split('.');
    const newMessages = JSON.parse(data.toString());

    if (isValidDefaultNamespace && defaultNamespace === namespace) {
      resources[language] = { ...resources[language], ...newMessages };
    } else {
      resources[language][namespace] = newMessages;
    }
  });

  return JSON.stringify(resources);
}

/**
 * Generates the translations file.
 */
export async function generateTolgeeTranslations(options: Options) {
  const { apiKey, apiUrl, defaultNamespace, languages, prettier, outputPath } =
    options;

  await validateLanguages(languages, { apiKey, apiUrl });

  const zip = await fetchTranslationsZip(options);
  const files = await decompress(zip);
  const body = mergeTranslations(languages, files, defaultNamespace);

  writeResourceFile(body, outputPath, prettier);
}
