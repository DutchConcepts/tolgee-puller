// external
import type { Arguments, CommandModule } from 'yargs';
import { cwd } from 'process';
import { resolve } from 'path';

// env
import { env } from '../env';

// helpers
import { logError, logSuccess } from '../helpers/logger';
import { generateTolgeeTranslations } from '../helpers/tolgee';

// constants
const DEFAULT_OUTPUT_PATH = 'node_modules/tolgee-puller/messages.ts';

type Options = Arguments<{
  apiKey: string | null;
  apiUrl: string | null;
  languages: string[] | null;
  namespaces: string[] | null;
  defaultNamespace: string | null;
  outputPath: string | null;
  split: boolean | null;
}>;

const command: CommandModule<unknown, Options> = {
  command: 'generate',
  describe: 'Generate locale messages',
  aliases: 'gen',
  builder: {
    apiKey: {
      default: null,
      description: 'The Personal Access Token or a Project API Key.',
    },
    apiUrl: {
      default: null,
      description: 'The API url of your Tolgee (selfhosted) server.',
      defaultDescription: 'Tolgee API',
    },
    outputPath: {
      default: null,
      defaultDescription: DEFAULT_OUTPUT_PATH,
      description: 'The output path (from root) for the generated file.',
    },
    languages: {
      default: null,
      description: 'The language(s) that need to be fetched.',
    },
    namespaces: {
      default: null,
      description: 'The namespaces that need to be fetched.',
    },
    defaultNamespace: {
      default: null,
      description: 'The default namespace of the project.',
    },
    split: {
      default: false,
      boolean: true,
      description: 'The default namespace of the project.',
    },
  },
  handler: async (argv) => {
    const options = {
      apiKey: argv.apiKey || env.TOLGEE_API_KEY || null,
      apiUrl: argv.apiUrl || env.TOLGEE_API_URL || 'https://app.tolgee.io',
      languages: argv.languages || env.TOLGEE_LANGUAGES || null,
      namespaces: argv.namespaces || env.TOLGEE_NAMESPACES || [],
      defaultNamespace:
        argv.defaultNamespace || env.TOLGEE_DEFAULT_NAMESPACE || null,
      outputPath:
        argv.outputPath || env.TOLGEE_OUTPUT_PATH || DEFAULT_OUTPUT_PATH,
      split: argv.split || env.TOLGEE_SPLIT,
    };

    console.log(argv.split, env.TOLGEE_SPLIT);

    const outputPath = resolve(cwd(), options.outputPath);

    try {
      if (!options.apiKey) {
        throw new Error('No API key specified.');
      }

      if (!options.namespaces.length) {
        throw new Error('No namespaces specified.');
      }

      if (
        options.defaultNamespace &&
        !options.namespaces.includes(options.defaultNamespace)
      ) {
        throw new Error(
          'The option `defaultNamespace` should be one of the specified namespaces.'
        );
      }

      await generateTolgeeTranslations({
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        defaultNamespace: options.defaultNamespace,
        languages: options.languages,
        namespaces: options.namespaces,
        outputPath,
        split: options.split,
      });

      logSuccess('Pulled translation files from Tolgee!');
    } catch (e) {
      logError('Failed pulling translation files from Tolgee.');
      throw e;
    }
  },
};

export default command;
