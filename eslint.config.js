// Flat config for ESLint 10 + typescript-eslint v8.
// Replaces .eslintrc.js (removed: ESLint 10 no longer supports eslintrc).
// Mirrors the old extends as closely as possible:
//   'eslint:recommended'                        -> js.configs.recommended
//   'plugin:@typescript-eslint/eslint-recommended' -> tsPlugin.configs['flat/eslint-recommended']
//   'plugin:@typescript-eslint/recommended'     -> tsPlugin.configs['flat/recommended']
const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: ['build/', 'dist/', 'docs/', 'coverage/', 'node_modules/'],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  tsPlugin.configs['flat/eslint-recommended'],
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Repo config files (jest.config.js, webpack.config.js, this file) are
  // CommonJS run by node: declare the node CJS globals for them (the old
  // v5 setup disabled no-undef outright via eslint-recommended) and scope
  // @typescript-eslint/no-require-imports (new in v8 recommended) away from
  // them, since require() is the correct module syntax for CJS files.
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
