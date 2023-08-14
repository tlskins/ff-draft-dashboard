/*global chrome*/
/*global chrome.extension*/
import 'tailwindcss/tailwind.css'
import { useEffect } from 'react'

function MyApp({ Component, pageProps }) {
  // useEffect(() => {
  //   const script = document.createElement('script');
  //   script.src = chrome.extension.getURL('contentScript.js');
  //   script.async = true;
  //   document.head.appendChild(script);
  // }, []);

  return <Component {...pageProps} />
}

export default MyApp
