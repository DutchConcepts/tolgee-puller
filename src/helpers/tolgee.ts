// external
import { writeFileSync } from 'fs';
import decompress from 'decompress';
import fetch from 'node-fetch';
import path from 'path';
import { isPresent } from 'ts-is-present';

interface Options {
  apiKey: string;
  apiUrl: string;
  languages: string[];
  namespaces: string[];
  defaultNamespace: string | null;
  outputPath: string;
  split: boolean;
}

type ApiOptions = Pick<Options, 'apiKey' | 'apiUrl'>;

interface Message {
  [key: string]: string | Message;
}

interface Locales {
  [language: string]: {
    [namespace: string]: {
      [key: string]: Message;
    };
  };
}

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

async function tolgeeApi(path: string, options: ApiOptions) {
  const response = await fetch(`${options.apiUrl}/v2${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': options.apiKey,
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
 * Get an array of languages.
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
 * Generates a `messages.ts` file in the root of this repository.
 */
export async function generateTolgeeTranslations(options: Options) {
  const { apiKey, apiUrl, defaultNamespace, languages, outputPath, split } =
    options;

  // Fetch all languages and the zipped translations.
  await validateLanguages(languages, { apiKey, apiUrl });

  const zip = await fetchTranslationsZip(options);

  // Extract the zip so we can use the files.
  const files = await decompress(zip);

  const source = mergeTranslations(languages, files, defaultNamespace);

  if (split) {
    writeMultipleLanguageFiles(source, outputPath);
  } else {
    writeMessagesFile(source, outputPath);
  }
}

/**
 * Returns an object with all translations merged.
 */
export function mergeTranslations(
  languages: string[],
  files: decompress.File[],
  defaultNamespace: string | null
) {
  const messages: Locales = languages.reduce((preVal, value) => {
    return { ...preVal, [value]: {} };
  }, {});

  const isValidDefaultNamespace =
    !!defaultNamespace && defaultNamespace.length > 0;

  files.forEach(({ path, data }) => {
    const [namespace, filename] = path.split('/');
    const [language] = filename.split('.');
    const newMessages = JSON.parse(data.toString());

    if (isValidDefaultNamespace && defaultNamespace === namespace) {
      messages[language] = { ...messages[language], ...newMessages };
    } else {
      messages[language][namespace] = newMessages;
    }
  });

  return messages;
}

/**
 * Writes the translations file.
 */
function writeMessagesFile(
  messages: Locales | Locales[string],
  outputPath: string
) {
  const stringifiedMessages = JSON.stringify(messages);
  const codeStr = `// THIS FILE IS GENERATED, DO NOT EDIT!\nconst resources = ${stringifiedMessages};\ntype Resources = typeof resources;\nexport { resources, type Resources };`;

  writeFileSync(outputPath, codeStr);
}

function writeMultipleLanguageFiles(source: Locales, outputPath: string) {
  const outputDir = path.dirname(outputPath);

  for (const [language, messages] of Object.entries(source)) {
    writeMessagesFile(messages, `${outputDir}/${language}.ts`);
  }
}
