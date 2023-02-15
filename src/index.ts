#!/usr/bin/env node

// external
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

// commands
import { addCommands } from './cmds';

const instance = yargs(hideBin(process.argv));

// Wrap the content inside of the terminal to match it's width.
instance.wrap(instance.terminalWidth());

// Add the commands to the yargs instance.
addCommands(instance);

// Add help command that triggers help output.
instance.help();

// This makes the cli actually work.
instance.parse();
