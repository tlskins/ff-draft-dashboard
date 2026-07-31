const { readFileSync } = require("node:fs")
const Module = require("node:module")
const { resolve } = require("node:path")
const ts = require("typescript")

// This command executes the same production TypeScript evidence kernel without
// a test runner or a second JavaScript implementation.
process.env.NODE_PATH = [process.cwd(), process.env.NODE_PATH]
  .filter(Boolean)
  .join(require("node:path").delimiter)
Module.Module._initPaths()
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: filename,
  }).outputText
  module._compile(output, filename)
}

require(resolve(__dirname, "calibrationCampaignRunner.ts")).main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
