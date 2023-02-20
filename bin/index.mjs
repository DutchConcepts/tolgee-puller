#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { cwd } from 'process';
import { resolve } from 'path';
import { cleanEnv, str, url, json } from 'envalid';
import 'dotenv/config';
import pc from 'picocolors';
import { writeFileSync } from 'fs';
import decompress from 'decompress';
import fetch from 'node-fetch';

const env = cleanEnv(process.env, {
  MODE: str({
    default: "development",
    choices: ["development", "staging", "production"]
  }),
  TOLGEE_API_KEY: str({ default: "" }),
  TOLGEE_API_URL: url({ default: "" }),
  TOLGEE_NAMESPACES: json({ default: [] }),
  TOLGEE_DEFAULT_NAMESPACE: str({ default: "" })
});

function logSuccess(message, ...args) {
  console.log(pc.green(pc.bold(`[tolgee-puller] `)), message, pc.green("\u2714"));
  args.forEach((arg) => console.error(arg));
}
function logError(message, ...args) {
  console.error(pc.red(pc.bold(`[tolgee-puller] `)), message, pc.red("\u26A0"));
  args.forEach((arg) => console.error(arg));
}

function parseMultiValueFilter(filter, values) {
  return `${filter}=${values.join(`&${filter}=`)}`;
}
function isObjectWithProp(value, key) {
  return typeof value === "object" && value !== null && key in value;
}
async function tolgeeApi(path, options) {
  const response = await fetch(`${options.apiUrl}/v2${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": options.apiKey
    }
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response;
}
async function fetchTranslationsZip(options) {
  const { namespaces } = options;
  const queryParams = parseMultiValueFilter("filterNamespace", namespaces);
  const response = await tolgeeApi(`/projects/export?${queryParams}`, options);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));
  return buffer;
}
async function fetchLanguages(options) {
  const result = await tolgeeApi("/projects/languages", options);
  const data = await result.json();
  if (isObjectWithProp(data, "_embedded") && isObjectWithProp(data._embedded, "languages")) {
    const languages = data?._embedded?.languages;
    if (Array.isArray(languages)) {
      return languages.map((language) => language.tag);
    }
  }
  throw new Error(`Failed retrieving languages. ${JSON.stringify(data)}`);
}
async function generateTolgeeTranslations(options) {
  const locales = await fetchLanguages(options);
  const zip = await fetchTranslationsZip(options);
  const files = await decompress(zip);
  const messages = mergeTranslations(locales, files, options.defaultNamespace);
  writeMessagesFile(messages, options.outputPath);
}
function mergeTranslations(locales, files, defaultNamespace) {
  const messages = locales.reduce((preVal, value) => {
    return { ...preVal, [value]: {} };
  }, {});
  const isValidDefaultNamespace = !!defaultNamespace && defaultNamespace.length > 0;
  files.forEach(({ path, data }) => {
    const [namespace, filename] = path.split("/");
    const [language] = filename.split(".");
    const newMessages = JSON.parse(data.toString());
    if (isValidDefaultNamespace && defaultNamespace === namespace) {
      messages[language] = { ...messages[language], ...newMessages };
    } else {
      messages[language][namespace] = newMessages;
    }
  });
  return messages;
}
function writeMessagesFile(messages, outputPath) {
  const stringifiedMessages = JSON.stringify(messages);
  const codeStr = `// THIS FILE IS GENERATED, DO NOT EDIT!
const messages = ${stringifiedMessages};
type Messages = typeof messages;
export { messages, type Messages };`;
  writeFileSync(`${outputPath}/messages.ts`, codeStr);
}

const command = {
  command: "generate",
  describe: "Generate locale messages",
  aliases: "gen",
  builder: {
    apiKey: {
      default: null,
      description: "The Personal Access Token or a Project API Key."
    },
    apiUrl: {
      default: null,
      description: "The API url of your Tolgee (selfhosted) server.",
      defaultDescription: "Tolgee API"
    },
    namespaces: {
      default: null,
      description: "The namespaces that need to be fetched."
    },
    defaultNamespace: {
      default: null,
      description: "The default namespace of the project."
    }
  },
  handler: async (argv) => {
    const options = {
      apiKey: argv.apiKey || env.TOLGEE_API_KEY || null,
      apiUrl: argv.apiUrl || env.TOLGEE_API_URL || "https://app.tolgee.io",
      namespaces: argv.namespaces || env.TOLGEE_NAMESPACES || [],
      defaultNamespace: argv.defaultNamespace || env.TOLGEE_DEFAULT_NAMESPACE || null
    };
    if (!options.apiKey) {
      return logError("No API key specified.");
    }
    if (!options.namespaces.length) {
      return logError("No namespaces specified.");
    }
    if (options.defaultNamespace && !options.namespaces.includes(options.defaultNamespace)) {
      return logError(
        "The option `defaultNamespace` should be one of the specified namespaces."
      );
    }
    if (options.namespaces.length === 1) {
      options.defaultNamespace = options.namespaces[0];
    }
    const outputPath = resolve(cwd(), "node_modules/tolgee-puller");
    try {
      await generateTolgeeTranslations({
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        namespaces: options.namespaces,
        defaultNamespace: options.defaultNamespace,
        outputPath
      });
      logSuccess("Pulled translation files from Tolgee!");
    } catch (e) {
      logError("Failed pulling translation files from Tolgee.", e);
    }
  }
};
const generateCommand = command;

function addCommands(argv) {
  const commands = [generateCommand];
  commands.forEach((command) => argv.command(command));
}

const instance = yargs(hideBin(process.argv));
instance.wrap(instance.terminalWidth());
addCommands(instance);
instance.help();
instance.parse();
