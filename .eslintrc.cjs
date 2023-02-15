/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  extends: ['eslint:recommended'],
  rules: {
    'sort-imports': ['error', { allowSeparatedGroups: true }],
  },
  plugins: ['prettier'],
};
