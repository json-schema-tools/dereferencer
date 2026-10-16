module.exports = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: require('path').join(__dirname, 'coverage'),
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: { global: { branches: 97.95, functions: 100, lines: 98.91, statements: 99.01 } },
  resetMocks: true,
  restoreMocks: true,
  rootDir: './src',
  preset: 'ts-jest'
};
