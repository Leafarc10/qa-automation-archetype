// NOTE: with `"type": "module"` in package.json, cucumber-js loads this file
// via a real ESM `import()`, which always wraps the module's default export
// under its own `.default` property. Nesting the profile under an extra
// `default: {...}` key here (as this repo previously had) collides with that
// wrapper and silently breaks `paths`/`import`/`loader` resolution. Exporting
// the flat profile object directly (no inner "default" key) is the correct
// shape for this project's single ("default") profile.
export default {
  paths: ['features/**/*.feature'],
  import: ['support/world.ts', 'support/hooks.ts', 'features/steps/**/*.ts'],
  loader: ['ts-node/esm'],
  format: [
    'progress',
    'json:reports/cucumber/cucumber-report.json',
    'html:reports/cucumber/cucumber-report.html',
  ],
  publishQuiet: true,
};
