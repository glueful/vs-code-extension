/// <reference types="vitest/globals" />

// This file provides vitest global types when available
// and fallback declarations when vitest is not installed

declare global {
  // Vitest globals - these will be overridden by vitest/globals when available
  const describe: any;
  const it: any;
  const test: any;
  const expect: any;
  const beforeAll: any;
  const afterAll: any;
  const beforeEach: any;
  const afterEach: any;
  const vi: any;
}

export {};