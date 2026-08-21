/*global chrome*/
/*global chrome.extension*/
import 'tailwindcss/tailwind.css'
import 'react-toastify/dist/ReactToastify.css'
import dynamic from 'next/dynamic'
import { ReadApiProvider } from '../behavior/api/readApiContext'

const ToastContainer = dynamic(
  () => import('react-toastify').then(module => module.ToastContainer),
  {ssr: false},
)

function MyApp({ Component, pageProps }) {
  return <ReadApiProvider>
    <Component {...pageProps} />
    <ToastContainer />
  </ReadApiProvider>
}

export default MyApp
