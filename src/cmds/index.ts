// external
import { Argv } from 'yargs';

// commands
import generateCommand from './generate';

/**
 * The command function should be able to take an array of commands
 * according to the docs but TypeScript isn't a fan of it apperently.
 * @param argv
 */
export function addCommands(argv: Argv) {
  const commands = [generateCommand];

  commands.forEach((command) => argv.command(command));
}
