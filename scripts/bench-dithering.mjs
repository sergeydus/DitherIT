// Manual benchmark only: npm run bench. Not imported by tests or run in CI.
// Transpile the pure module in memory so the script also runs on Node 20.
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/dithering.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { applyDithering, ALGORITHM_VERSION } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const width = 1000;
const height = 1000;
const bits = 3;
const seed = 42;
const warmups = 2;
const runs = 5;
const data = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    data[index] = Math.round(x * 255 / (width - 1));
    data[index + 1] = Math.round(y * 255 / (height - 1));
    data[index + 2] = (x * 13 + y * 7) & 255;
    data[index + 3] = (x + y) % 29 === 0 ? 0 : (x + y) % 17 === 0 ? 128 : 255;
  }
}
const image = { width, height, data };
const results = [];
let checksum = 0;
for (const method of ['none', 'threshold', 'floyd-steinberg', 'atkinson', 'ordered', 'random']) {
  for (const soften of [false, true]) {
    const samples = [];
    for (let run = -warmups; run < runs; run++) {
      const start = performance.now();
      const output = applyDithering(image, method, bits, { seed, soften });
      const elapsed = performance.now() - start;
      // Consume results outside the timed region. No decoding or PNG encoding is timed.
      checksum = (checksum + output.data[4] + output.data[output.data.length - 2]) >>> 0;
      if (run >= 0) samples.push(elapsed);
    }
    samples.sort((a, b) => a - b);
    results.push({ method, soften, medianMs: Number(samples[2].toFixed(2)) });
  }
}
const report = {
  node: process.version, platform: `${process.platform}/${process.arch}`, cpu: cpus()[0]?.model.trim(),
  algorithmVersion: ALGORITHM_VERSION, width, height, bits, seed, warmups, runs,
  fixture: 'RGB gradients/texture, alpha 0/128/255; includes output allocation and soften; Original bypasses soften',
  results, checksum,
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.node} | ${report.platform} | ${report.cpu}`);
  console.log(`${width} x ${height} (1 MP), ${bits} bits/channel, seed ${seed}, ${warmups} warmups, median of ${runs}`);
  console.log(report.fixture);
  console.table(results);
  console.log(`Checksum: ${checksum}`);
}
