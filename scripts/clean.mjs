import { rm } from 'node:fs/promises';
await Promise.all(['build', 'dist'].map((path) => rm(path, { recursive: true, force: true })));
