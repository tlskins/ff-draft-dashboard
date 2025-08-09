import React from "react"

import Dropdown from "./dropdown"


const DraftLoaderOptions: React.FC = () => {
  return(
    <div className="flex flex-col w-full h-14 border-t relative">
      <div className="flex w-full justify-center items-center">
        <div>
          <Dropdown
            title="Download Extension"
            options={[
              { title: "Download", callback: () => window.open('https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US') },
            ]}
            className="m-2 px-3 py-2 hover:text-white hover:bg-blue-800 cursor-pointer"
            buttonClassName="font-semibold tracking-wide uppercase"
          />
        </div>

        <Dropdown
          title="Find Mock Draft"
          options={[
            { title: "ESPN Mock Draft", callback: () => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ffl2023`) },
            { title: "NFL.com Mock Draft", callback: () => window.open('https://fantasy.nfl.com/draftcenter/mockdrafts') },
          ]}
          className="m-2 px-3 py-2 hover:text-white hover:bg-blue-800 cursor-pointer"
          buttonClassName="font-semibold tracking-wide uppercase"
        />
      </div>
    </div>
  )
}

export default DraftLoaderOptions