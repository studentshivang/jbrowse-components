// NOTE: this jest config should be used by projects in packages/*, products/*,
// and plugins/* dirs
module.exports = {
  roots: ['.', 'packages/', 'products/', 'plugins/'],
  moduleFileExtensions: ['js', 'ts', 'tsx', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': '<rootDir>/config/jest/babelTransform.js',
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
    '^(?!.*\\.(ts|js|tsx|jsx|css|json)$)':
      '<rootDir>/config/jest/fileTransform.js',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx)$',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  testMatch: [
    '<rootDir>/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/**/*.(spec|test).{js,jsx,ts,tsx}',
  ],
  testPathIgnorePatterns: ['/dist/', '/cypress/', '/demos/'],
  collectCoverageFrom: [
    'packages/*/src/**/*.{js,jsx,ts,tsx}',
    'products/*/src/**/*.{js,jsx,ts,tsx}',
    'plugins/*/src/**/*.{js,jsx,ts,tsx}',
    // most packages have their src in src/, except for jbrowse-core
    'packages/core/**/*.{js,jsx,ts,tsx}',
  ],
  coveragePathIgnorePatterns: [
    '!*.d.ts',
    'makeWorkerInstance.ts',
    'react-colorful.js',
    'QuickLRU.js',
  ],
  setupFiles: [
    '<rootDir>/config/jest/textEncoder.js',
    '<rootDir>/config/jest/resizeObserver.js',
    '<rootDir>/config/jest/fetchMock.js',
    '<rootDir>/config/jest/console.js',
    '<rootDir>/config/jest/crypto.js',
    'jest-localstorage-mock',
  ],
  testEnvironmentOptions: { url: 'http://localhost' },
  testEnvironment: 'jsdom',
}
