module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'es2017',
        module: 'commonjs',
        lib: ['es2017'],
        allowJs: true,
        skipLibCheck: true,
        strict: false,
        noImplicitAny: false,
        strictNullChecks: false,
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        resolveJsonModule: true
      }
    }]
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup-simple.ts'],
  testTimeout: 30000,
  verbose: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/dist-simple/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  }
};