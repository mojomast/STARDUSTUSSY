import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

export default [
  // Main bundle - Core functionality
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        exclude: ['**/*.test.ts', 'tests/**/*'],
      }),
      isProduction && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          dead_code: true,
          unused: true,
          passes: 2,
        },
        mangle: {
          properties: {
            regex: /^_/,
          },
        },
      }),
    ].filter(Boolean),
    external: ['redux', 'mobx', 'react', 'react-dom'],
  },
  
  // Handoff feature bundle (lazy loaded)
  {
    input: 'src/handoff/index.ts',
    output: [
      {
        file: 'dist/handoff.cjs.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/handoff.esm.js',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        exclude: ['**/*.test.ts', 'tests/**/*'],
      }),
      isProduction && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          dead_code: true,
          unused: true,
        },
      }),
    ].filter(Boolean),
    external: ['redux', 'mobx', 'react', 'react-dom'],
  },
  
  // Adapters bundle (lazy loaded)
  {
    input: 'src/adapters/index.ts',
    output: [
      {
        file: 'dist/adapters.cjs.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/adapters.esm.js',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        exclude: ['**/*.test.ts', 'tests/**/*'],
      }),
      isProduction && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          dead_code: true,
          unused: true,
        },
      }),
    ].filter(Boolean),
    external: ['redux', 'mobx', 'react', 'react-dom'],
  },
];
