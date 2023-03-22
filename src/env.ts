import { cleanEnv, json, str, url, bool } from 'envalid';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

// Enable usages of variables inside `.env` files with `dotenv-expand`.
expand(dotenv.config());

export const env = cleanEnv(process.env, {
  MODE: str({
    default: 'development',
    choices: ['development', 'staging', 'production'],
  }),
  TOLGEE_API_KEY: str({ default: '' }),
  TOLGEE_API_URL: url({ default: '' }),
  TOLGEE_LANGUAGES: json<string[]>({ default: [] }),
  TOLGEE_NAMESPACES: json<string[]>({ default: [] }),
  TOLGEE_DEFAULT_NAMESPACE: str({ default: '' }),
  TOLGEE_OUTPUT_PATH: str({ default: '' }),
  TOLGEE_SPLIT: bool({ default: false }),
});
