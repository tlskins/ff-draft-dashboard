import { readFile, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

import {
  CalibrationCampaignManifest,
  runCalibrationCampaign,
  validateCalibrationCampaignManifest,
} from "../behavior/draft-advisor/calibrationCampaign"

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"))

export const resolveCampaignFixturePath = (
  repositoryRoot: string,
  fixturePath: string,
): string => {
  if (isAbsolute(fixturePath)) throw new Error("fixture path must be relative")
  const resolved = resolve(repositoryRoot, fixturePath)
  const pathFromRoot = relative(repositoryRoot, resolved)
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("fixture path escapes the repository")
  }
  return resolved
}

export const loadCalibrationCampaign = async (
  manifestPath: string,
  repositoryRoot = process.cwd(),
): Promise<{
  manifest: CalibrationCampaignManifest
  fixturesByPath: Record<string, unknown>
}> => {
  const rawManifest = await readJson(manifestPath)
  const validation = validateCalibrationCampaignManifest(rawManifest)
  if (!validation.manifest) {
    throw new Error(`Invalid calibration campaign: ${validation.errors.join("; ")}`)
  }
  const fixturesByPath = Object.fromEntries(await Promise.all(
    validation.manifest.evidence.map(async evidence => {
      const fixturePath = resolveCampaignFixturePath(repositoryRoot, evidence.fixturePath)
      try {
        return [evidence.fixturePath, await readJson(fixturePath)]
      } catch {
        return [evidence.fixturePath, undefined]
      }
    }),
  ))
  return { manifest: validation.manifest, fixturesByPath }
}

export const main = async (): Promise<void> => {
  const args = new Map<string, string>()
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1])
  }
  const manifestPath = args.get("--manifest")
  const outputPath = args.get("--out")
  if (!manifestPath) {
    throw new Error("Usage: npm run calibration:campaign -- --manifest <campaign.json> [--out <report.json>]")
  }

  const { manifest, fixturesByPath } = await loadCalibrationCampaign(resolve(manifestPath))
  const report = runCalibrationCampaign(manifest, fixturesByPath)
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (outputPath) await writeFile(resolve(outputPath), json)
  process.stdout.write(json)
  process.stdout.write(
    `Calibration: ${report.canonical.qualifyingMockCount}/${report.canonical.targetMockCount} qualifying mocks; `
    + `${report.canonical.qualifyingDraftSlots.length}/${report.canonical.targetDraftSlotCount} distinct target slots; `
    + `${report.runtimeTelemetry.ready ? "READY" : "NOT READY"}.\n`,
  )
}
