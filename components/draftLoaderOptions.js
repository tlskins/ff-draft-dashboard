

import React, { useState } from "react"


const papaparseOptions = {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
}

const DraftLoaderOptions = ({
  onLoadHarrisRanks,
  onLoadFprosRanks,
  onFileLoaded,
  onUpdateEspnRanks,
  onSetCsvData,

  draftStarted,
  arePlayersLoaded,
}) => {
  // csv
  const [csvData, setCsvData] = useState(null)
  const [isUpload, setIsUpload] = useState(false)
  const [showHowToExport, setShowHowToExport] = useState(false)

  return(
    <div className="flex flex-row my-4">
      <div className="flex flex-col">
        <input type="button"
          className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-blue-200"
          value="Load Current Harris Ranks"
          onClick={ onLoadHarrisRanks }
        />

        <input type="button"
          className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-yellow-200"
          value="Load Current Fantasy Pros Ranks"
          onClick={ onLoadFprosRanks }
        />

        { !isUpload &&
          <input type="button"
            className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-200"
            value="Upload CSV"
            onClick={ () => setIsUpload(true) }
          />
        }
        { isUpload &&
          <CSVReader
            cssClass="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase text-sm flex flex-col"
            label="Upload Ranks"
            onFileLoaded={ onFileLoaded }
            parserOptions={papaparseOptions}
          />
        }
      </div>

      <div className="flex flex-col">
        { (arePlayersLoaded && !csvData) &&
          <div>
            <input type="button"
              className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-200"
              value="Export & Edit Ranks CSV"
              onMouseEnter={ () => setShowHowToExport(true) }
              onMouseLeave={ () => setShowHowToExport(false) }
              onClick={ onSetCsvData }
            />
            { showHowToExport &&
              <div className="relative">
                <div className="absolute mr-20 -my-20 w-96 bg-yellow-300 text-black text-left text-xs font-semibold tracking-wide rounded shadow py-1.5 px-4 bottom-full z-10">
                  <ul className="list-disc pl-6">
                    <li>Export ranks to CSV</li>
                    <li>Edit the custom PPR / STD ranks for each position</li>
                    <li>Optionally add a column "tier" with number 1-10</li>
                    <li>Upload new CSV</li>
                  </ul>
                </div>
              </div>
            }
          </div>
        }
        { csvData && 
          <CSVLink data={csvData}
            onClick={ () => setCsvData(null)}
            className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-green-300"
          >
            Download
          </CSVLink>
        }
      </div>

      <div className="flex flex-col">
        { (!draftStarted && arePlayersLoaded) &&
          <input type="button"
            className="tracking-wide font-semibold border rounded px-4 py-2 m-2 cursor-pointer shadow-md uppercase bg-indigo-300"
            value="Sync Current ESPN ADP"
            onClick={ onUpdateEspnRanks }
          />
        }
      </div>
    </div>
  )
}

export default DraftLoaderOptions