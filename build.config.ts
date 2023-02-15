import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: ['src/index'],
  outDir: 'bin',
  clean: true,
  rollup: {
    emitCJS: true,
  },
});
