# tolgee-puller

This repository allows you to fetch translations from a (selfhosted) Tolgee server and use them inside of your project.

## Usage

1. Add keys to `.env` or use the appropriate flags:

```txt
API key:
  flag: `--apiKey`
  env: TOLGEE_API_KEY
API Url:
  flag: '--apiUrl'
  env: TOLGEE_API_URL
Namespaces:
  flag: '--namespaces'
  env: TOLGEE_NAMESPACES
Default namespace:
  flag: '--defaultNamespace'
  env: TOLGEE_DEFAULT_NAMESPACE
```

2. Add command to development and production scripts like below:

```ts
// package.json

{
  // ...
  "scripts": {
    "generate:locales": "tolgee-puller generate",
    "build": "npm run generate:locales && vue-tsc --noEmit && vite build",
  },
  // ...
}
```

3. Make use of the generated translations like below:

```ts
import { type Messages, messages } from 'tolgee-puller/messages';
```
