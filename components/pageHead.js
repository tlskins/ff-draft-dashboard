import React from "react"
import Head from "next/head"
import PropTypes from "prop-types"

const PAGE_URL = "ff-draft-dashboard.vercel.app"

const PageHead = ({
  title = "FF Draft Dashboard",
  desc = "Live drafting dashboard that predicts players taken and better view of available players",
}) => {
  return(
    <Head>
        { process.env.NEXT_PUBLIC_ENV !== "dev" &&
            <>
                <script
                  dangerouslySetInnerHTML={{
                  __html: `
                    window.heap=window.heap||[],heap.load=function(e,t){window.heap.appid=e,window.heap.config=t=t||{};var r=document.createElement("script");r.type="text/javascript",r.async=!0,r.src="https://cdn.heapanalytics.com/js/heap-"+e+".js";var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(r,a);for(var n=function(e){return function(){heap.push([e].concat(Array.prototype.slice.call(arguments,0)))}},p=["addEventProperties","addUserProperties","clearEventProperties","identify","resetIdentity","removeEventProperty","setEventProperties","track","unsetEventProperty"],o=0;o<p.length;o++)heap[p[o]]=n(p[o])};
                    heap.load("1966853068");
                  `,}}>
                </script>
                {/* <script async
                    src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
                />
                <script
                    dangerouslySetInnerHTML={{
                    __html: `
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                    
                        gtag('config', ${process.env.NEXT_PUBLIC_GTM_ID});
                    `,}}>
                </script> */}

                <title>FF Draft Dashboard</title>
                <meta name="description" content={desc}/>

                {/* <meta property="og:url" content="https://tennis-community-web.vercel.app/"/> */}
                <meta property="og:type" content="website"/>
                <meta property="og:title" content={title}/>
                <meta property="og:description" content={desc}/>

                <meta name="twitter:card" content="summary_large_image"/>
                <meta property="twitter:domain" content={PAGE_URL}/>
                <meta property="twitter:url" content={`https://${PAGE_URL}/`}/>
                <meta name="twitter:title" content={title}/>
                <meta name="twitter:description" content={desc}/>
            </>
        }
    </Head>
  )
}

PageHead.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
}  

export default PageHead