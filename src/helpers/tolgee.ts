// external
import { writeFileSync } from 'fs';
import decompress from 'decompress';
import fetch from 'node-fetch';

interface Options {
  apiKey: string;
  apiUrl: string;
  defaultNamespace: string;
  namespaces: string[];
  outputPath: string;
}

interface Message {
  [key: string]: string | Message;
}

interface Locales {
  [language: string]: {
    [component: string]: Message;
  };
}

/**
 * Creates a query string for multi-value filters.
 */
function parseMultiValueFilter(filter: string, values: string[]) {
  return `${filter}=${values.join(`&${filter}=`)}`;
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

async function tolgeeApi(path: string, options: Options) {
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
  const { namespaces } = options;

  // We parse the filters to: '?filterNamespace=[value]&filterNamespace=[value]
  const queryParams = parseMultiValueFilter('filterNamespace', namespaces);

  const response = await tolgeeApi(`/projects/export?${queryParams}`, options);

  // We want to work with buffers so we can use the `decompress` package.
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));

  return buffer;
}

/**
 * Get an array of languages.
 */
async function fetchLanguages(options: Options): Promise<string[]> {
  const result = await tolgeeApi('/projects/languages', options);
  const data = await result.json();

  if (
    isObjectWithProp(data, '_embedded') &&
    isObjectWithProp(data._embedded, 'languages')
  ) {
    const languages = data?._embedded?.languages;

    if (Array.isArray(languages)) {
      return languages.map((language) => language.tag);
    }
  }

  throw new Error(`Failed retrieving languages. ${JSON.stringify(data)}`);
}

/**
 * Generates a `messages.ts` file in the root of this repository.
 */
export async function generateTolgeeTranslations(options: Options) {
  // Fetch all languages and the zipped translations.
  const locales = await fetchLanguages(options);
  const zip = await fetchTranslationsZip(options);

  // Extract the zip so we can use the files.
  const files = await decompress(zip);

  const messages = mergeTranslations(options.defaultNamespace, locales, files);

  writeMessagesFile(messages, options.outputPath);
}

/**
 * Returns an object with all translations merged.
 */
export function mergeTranslations(
  defaultNamespace: string,
  locales: string[],
  files: decompress.File[]
) {
  const messages: Locales = locales.reduce((preVal, value) => {
    return { ...preVal, [value]: {} };
  }, {});

  files.forEach(({ path, data }) => {
    const [namespace, filename] = path.split('/');
    const [language] = filename.split('.');
    const newMessages = JSON.parse(data.toString());

    if (namespace === defaultNamespace) {
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
function writeMessagesFile(messages: Locales, outputPath: string) {
  const stringifiedMessages = JSON.stringify(messages);
  const codeStr = `// THIS FILE IS GENERATED, DO NOT EDIT!\nconst messages = ${stringifiedMessages};\ntype Messages = typeof messages;\nexport { messages, type Messages };`;

  writeFileSync(`${outputPath}/messages.ts`, codeStr);
}
