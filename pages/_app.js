/*global chrome*/
/*global chrome.extension*/
import 'tailwindcss/tailwind.css'
import 'react-toastify/dist/ReactToastify.css'
import { ToastContainer } from 'react-toastify'
import { ReadApiProvider } from '../behavior/api/readApiContext'


function MyApp({ Component, pageProps }) {
  return <ReadApiProvider>
    <Component {...pageProps} />
    <ToastContainer />
  </ReadApiProvider>
}

export default MyApp
