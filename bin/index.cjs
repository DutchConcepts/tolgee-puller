#!/usr/bin/env node
'use strict';

const yargs = require('yargs/yargs');
const helpers = require('yargs/helpers');
const process$1 = require('process');
const path = require('path');
const envalid = require('envalid');
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
const pc = require('picocolors');
const fs = require('fs');
const decompress = require('decompress');
const fetch = require('node-fetch');
const tsIsPresent = require('ts-is-present');

dotenvExpand.expand(dotenv.config());
const env = envalid.cleanEnv(process.env, {
  MODE: envalid.str({
    default: "development",
    choices: ["development", "staging", "production"]
  }),
  TOLGEE_API_KEY: envalid.str({ default: "" }),
  TOLGEE_API_URL: envalid.url({ default: "" }),
  TOLGEE_LANGUAGES: envalid.json({ default: [] }),
  TOLGEE_NAMESPACES: envalid.json({ default: [] }),
  TOLGEE_DEFAULT_NAMESPACE: envalid.str({ default: "" })
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
function parseLanguages(languages) {
  if (!languages.length) {
    return null;
  }
  return `languages=${languages.join(",")}`;
}
function parseQueryParams(languages, namespaces) {
  const values = [
    parseLanguages(languages),
    parseMultiValueFilter("filterNamespace", namespaces)
  ].filter(tsIsPresent.isPresent);
  let queryStr = "?";
  values.forEach((value, index) => {
    if (index > 0) {
      queryStr += "&";
    }
    queryStr += `${value}`;
  });
  return queryStr;
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
  const { languages, namespaces } = options;
  const queryParams = parseQueryParams(languages, namespaces);
  const response = await tolgeeApi(`/projects/export${queryParams}`, options);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(new Uint8Array(arrayBuffer));
  return buffer;
}
async function validateLanguages(languages, options) {
  const result = await tolgeeApi("/projects/languages", options);
  const data = await result.json();
  if (isObjectWithProp(data, "_embedded") && isObjectWithProp(data._embedded, "languages")) {
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
async function generateTolgeeTranslations(options) {
  const { languages, defaultNamespace, apiKey, apiUrl } = options;
  await validateLanguages(languages, { apiKey, apiUrl });
  const zip = await fetchTranslationsZip(options);
  const files = await decompress(zip);
  const messages = mergeTranslations(languages, files, defaultNamespace);
  writeMessagesFile(messages, options.outputPath);
}
function mergeTranslations(languages, files, defaultNamespace) {
  const messages = languages.reduce((preVal, value) => {
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
  fs.writeFileSync(`${outputPath}/messages.ts`, codeStr);
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
    languages: {
      default: null,
      description: "The language(s) that need to be fetched."
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
      languages: argv.languages || env.TOLGEE_LANGUAGES || null,
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
    const outputPath = path.resolve(process$1.cwd(), "node_modules/tolgee-puller");
    try {
      await generateTolgeeTranslations({
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        languages: options.languages,
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

const instance = yargs(helpers.hideBin(process.argv));
instance.wrap(instance.terminalWidth());
addCommands(instance);
instance.help();
instance.parse();
