import { rename, rm } from 'node:fs/promises';

await rm(new URL('../dist/ScoreLens.html', import.meta.url), { force: true });
await rename(
  new URL('../dist/index.html', import.meta.url),
  new URL('../dist/ScoreLens.html', import.meta.url),
);
