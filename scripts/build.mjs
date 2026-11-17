import { build } from 'esbuild';
import ts from 'typescript';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(root, '.generated');
await mkdir(generated, { recursive: true });
await mkdir(path.join(root, 'dist'), { recursive: true });

// fonteditor-core 2.6.3 ships an older Emscripten loader. Replace only its
// dynamic binding generators with equivalent closures; never modify node_modules.
// Pin the dependency and fail the build if its loader structure changes.
const replacements = {
  createNamedFunction: `function createNamedFunction(name, body) {
    return function() { return body.apply(this, arguments); };
  }`,
  embind__requireFunction: `function embind__requireFunction(signature, pointer) {
    signature = readLatin1String(signature);
    var call = Module['dynCall_' + signature] || Module['dynCall_' + signature.replace(/f/g, 'd')];
    if (!call) throwBindingError('Unknown WASM signature: ' + signature);
    return function() { return call.apply(null, [pointer].concat(Array.from(arguments))); };
  }`,
  craftInvokerFunction: `function craftInvokerFunction(name, types, classType, invoke, target) {
    var method = types[1] !== null && classType !== null;
    var stackNeeded = types.slice(1).some(function(type) { return type && type.destructorFunction === undefined; });
    return function() {
      if (arguments.length !== types.length - 2) throwBindingError('Incorrect argument count: ' + name);
      var destructors = stackNeeded ? [] : null;
      var wired = [];
      var first = method ? 1 : 2;
      try {
        if (method) wired.push(types[1].toWireType(destructors, this));
        for (var i = 2; i < types.length; i++) wired.push(types[i].toWireType(destructors, arguments[i - 2]));
        var result = invoke.apply(null, [target].concat(wired));
        return types[0].name === 'void' ? undefined : types[0].fromWireType(result);
      } finally {
        if (destructors) runDestructors(destructors);
        else wired.forEach(function(value, index) {
          var destroy = types[index + first].destructorFunction;
          if (destroy) destroy(value);
        });
      }
    };
  }`
};
const packageRoot = path.join(root, 'node_modules/fonteditor-core');
const pkg = JSON.parse(
  await readFile(path.join(packageRoot, 'package.json'), 'utf8')
);
if (pkg.version !== '2.6.3')
  throw new Error('Review the WASM adapter before upgrading fonteditor-core.');
let loader = await readFile(path.join(packageRoot, 'woff2/woff2.js'), 'utf8');
const tree = ts.createSourceFile(
  'woff2.js',
  loader,
  ts.ScriptTarget.Latest,
  true
);
const edits = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && replacements[node.name?.text]) {
    edits.push({
      start: node.getStart(tree),
      end: node.end,
      text: replacements[node.name.text]
    });
  }
  ts.forEachChild(node, visit);
}
visit(tree);
if (edits.length !== 3)
  throw new Error('Unexpected WOFF2 binding generator structure.');
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  loader = loader.slice(0, edit.start) + edit.text + loader.slice(edit.end);
}
loader = loader.replace(
  /ENVIRONMENT_HAS_NODE=typeof process[^;]+;/,
  'ENVIRONMENT_HAS_NODE=false;'
);
// Remove the CommonJS/AMD export footer so the factory can be used as ESM.
loader = loader.slice(
  0,
  loader.lastIndexOf(
    "if (typeof exports === 'object' && typeof module === 'object')"
  )
);
if (/new Function\(|new_\(Function|eval\(/.test(loader))
  throw new Error('Dynamic code generation remains in WOFF2.');

const adapter = `import wasmModule from './woff2.wasm';
${loader}
let runtime;
function convert(method, input) {
  if (!runtime) throw new Error('WOFF2 is not initialized');
  const bytes = new Uint8Array(input);
  const vector = runtime[method](bytes, bytes.byteLength);
  try {
    const size = vector.size();
    if (!size || size > 24 * 1024 * 1024) throw new Error('WOFF2 output is empty or too large');
    const output = new Uint8Array(size);
    for (let i = 0; i < size; i++) output[i] = vector.get(i);
    return output;
  } finally {
    vector.delete(); // The upstream adapter leaks its C++ output vectors.
  }
}
export default {
  isInited: () => Boolean(runtime),
  init() {
    if (!runtime) {
      const created = Module({
        wasmMemory: new WebAssembly.Memory({ initial: 256, maximum: 1024 }),
        instantiateWasm(imports, receive) {
          const instance = new WebAssembly.Instance(wasmModule, imports);
          receive(instance);
          return instance.exports;
        }
      });
      if (!created.woff2Enc || !created.woff2Dec) throw new Error('WOFF2 initialization failed');
      runtime = created;
    }
    return Promise.resolve();
  },
  encode(input) { return convert('woff2Enc', input); },
  decode(input) { return convert('woff2Dec', input); }
};
`;
await writeFile(path.join(generated, 'woff2.js'), adapter);
await copyFile(
  path.join(packageRoot, 'woff2/woff2.wasm'),
  path.join(root, 'dist/woff2.wasm')
);
await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  conditions: ['workerd', 'import', 'default'],
  mainFields: ['module', 'main'],
  external: ['node:*', 'cloudflare:workers', './woff2.wasm'],
  legalComments: 'eof',
  plugins: [
    {
      name: 'workers-woff2',
      setup(builder) {
        builder.onResolve({ filter: /\/woff2\/index$/ }, () => ({
          path: path.join(generated, 'woff2.js')
        }));
        builder.onLoad({ filter: /\.txt$/ }, async (args) => ({
          contents: await readFile(args.path, 'utf8'),
          loader: 'text'
        }));
      }
    }
  ]
});
console.log('Built Worker, static asset configuration and WOFF2 module.');
