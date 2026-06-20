import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import path from 'node:path';
import url from 'node:url';

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = 'com.4xsdev.axis-gateway.sdPlugin';

/** @type {import('rollup').RollupOptions} */
const config = {
    input: 'src/plugin.ts',
    output: {
        file: `${sdPlugin}/bin/plugin.js`,
        format: 'esm',
        sourcemap: isWatching,
        sourcemapPathTransform: (relativeSourcePath, sourcemapPath) =>
            url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href,
    },
    plugins: [
        {
            name: 'watch-externals',
            buildStart() {
                this.addWatchFile(`${sdPlugin}/manifest.json`);
            },
        },
        typescript({ mapRoot: isWatching ? './' : undefined }),
        nodeResolve({ browser: false, exportConditions: ['node'], preferBuiltins: true }),
        commonjs(),
        // Stream Deck runs bin/plugin.js as an ES module; mark the bin dir accordingly.
        {
            name: 'emit-module-package-file',
            generateBundle() {
                this.emitFile({ fileName: 'package.json', source: '{ "type": "module" }', type: 'asset' });
            },
        },
    ],
};

export default config;
