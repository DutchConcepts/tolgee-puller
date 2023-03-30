// external
import { type Options, format, resolveConfig } from 'prettier';
import { writeFile } from 'fs/promises';
import TypeScriptParser from 'prettier/parser-typescript';

/**
 * Makes strings pretty.
 */
function makePretty(code: string, options?: Options | null) {
  return format(code, {
    parser: 'typescript',
    plugins: [TypeScriptParser],
    ...options,
  });
}

/**
 * Writes the translations file.
 */
export async function writeResourceFile(
  body: string,
  outputPath: string,
  prettify = false
) {
  let code = `// THIS FILE IS GENERATED, DO NOT EDIT!\nconst resources = ${body};\ntype Resources = typeof resources;\nexport { resources, type Resources };`;

  if (prettify) {
    const options = await resolveConfig(outputPath);
    code = makePretty(code, options);
  }

  writeFile(outputPath, code);
}
