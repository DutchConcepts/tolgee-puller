// external
import pc from 'picocolors';

export function logSuccess(message: string, ...args: unknown[]) {
  console.log(pc.green(pc.bold(`[tolgee-puller] `)), message, pc.green('✔'));
  args.forEach((arg) => console.error(arg));
}

export function logError(message: string, ...args: unknown[]) {
  console.error(pc.red(pc.bold(`[tolgee-puller] `)), message, pc.red('⚠'));
  args.forEach((arg) => console.error(arg));
}
