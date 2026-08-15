import React, { ChangeEvent, useRef, useState } from "react"

import {
  PORTABLE_DATA_MAX_BYTES,
  PortableDataPackage,
  PortableDataValidationContext,
  parsePortableDataPackage,
  portableDataSummary,
  serializePortableDataPackage,
} from "../behavior/portableData"

interface PortableDataControlsProps {
  createPackage: () => PortableDataPackage
  validationContext: PortableDataValidationContext
  onApply: (value: PortableDataPackage) => void
  importDisabledReason?: string | null
}

const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : "Unable to process local data"
)

const PortableDataControls: React.FC<PortableDataControlsProps> = ({
  createPackage,
  validationContext,
  onApply,
  importDisabledReason = null,
}) => {
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PortableDataPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const exportData = () => {
    try {
      const payload = serializePortableDataPackage(
        createPackage(),
        validationContext,
      )
      const blob = new Blob([payload], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "drafty-local-data-v2.json"
      anchor.click()
      URL.revokeObjectURL(url)
      setError(null)
      setStatus("Local data exported. Keep the JSON file private.")
    } catch (caught) {
      setStatus(null)
      setError(errorMessage(caught))
    }
  }

  const readSelectedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (file.size > PORTABLE_DATA_MAX_BYTES) {
      setPreview(null)
      setStatus(null)
      setError("Import file is larger than 512 KB")
      return
    }
    try {
      const serialized = await file.text()
      const nextPreview = parsePortableDataPackage(serialized, validationContext)
      setPreview(nextPreview)
      setError(null)
      setStatus(null)
    } catch (caught) {
      setPreview(null)
      setStatus(null)
      setError(errorMessage(caught))
    }
  }

  const confirmImport = () => {
    if (!preview) return
    try {
      onApply(preview)
      setPreview(null)
      setError(null)
      setStatus("Local data imported. Rankings and preferences were refreshed.")
    } catch (caught) {
      setStatus(null)
      setError(errorMessage(caught))
    }
  }

  return (
    <details className="mx-2 mb-2 w-full max-w-xl rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm">
      <summary className="cursor-pointer font-semibold text-slate-800">
        Data and recovery
      </summary>
      <p className="mt-2 text-xs text-slate-600">
        Export only your local rankings, tiers, preferences, targets, and confirmed draft plan. Draft picks, API state, conversations, and secrets are never included.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="rounded border border-indigo-300 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          onClick={exportData}
          type="button"
        >
          Export data
        </button>
        <button
          aria-describedby={importDisabledReason ? "portable-import-disabled" : undefined}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={Boolean(importDisabledReason)}
          onClick={() => fileInput.current?.click()}
          type="button"
        >
          Import data
        </button>
        <input
          accept="application/json,.json"
          aria-label="Choose Drafty local data JSON file"
          className="sr-only"
          onChange={readSelectedFile}
          ref={fileInput}
          type="file"
        />
      </div>
      {importDisabledReason && (
        <p className="mt-2 text-xs text-amber-800" id="portable-import-disabled">
          {importDisabledReason}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      {status && <p className="mt-2 text-sm text-emerald-700" role="status">{status}</p>}

      {preview && (
        <section
          aria-describedby="portable-import-summary"
          aria-labelledby="portable-import-title"
          className="mt-3 rounded border border-amber-300 bg-amber-50 p-3"
        >
          <h2 className="font-semibold text-slate-950" id="portable-import-title">
            Replace local data?
          </h2>
          <p className="mt-1 text-xs text-slate-700" id="portable-import-summary">
            This replaces the following browser-only data after you confirm:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
            {portableDataSummary(preview).map(item => <li key={item}>{item}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            This cannot change the current draft, extension connection, API data, or Realtime conversation.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="rounded bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-800"
              onClick={confirmImport}
              type="button"
            >
              Replace local data
            </button>
            <button
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setPreview(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </details>
  )
}

export default PortableDataControls
