import axios from "axios"


export const API_HOST = process.env.NEXT_PUBLIC_API_HOST

// Set config defaults when creating the instance
export const axios_ = axios.create({
  baseURL: API_HOST,
  timeout: 60000,
  withCredentials: true,
  responseType: "json",
})

export const hasSession = typeof window !== "undefined" && !!window.localStorage.getItem("authToken")

axios_.interceptors.request.use(
  (config) => {
    // window not available for static generation
    if (window) {
      // add jwt accessToken to auth header if present in localstorage
      const authToken = window.localStorage.getItem("authToken")
      if (authToken) {
        config.headers["Authorization"] = `Bearer ${authToken}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

axios_.interceptors.response.use((response) => {
  // extract jwt from response data and store to localstorage
  if (window && response && response.data) {
    const { authToken } = response.data
    if (authToken) {
      window.localStorage.setItem("authToken", authToken)
      delete response.data.accessToken
    }
  }

  return response
})


export const get = async ( uri, params ) => {
  let resp
  if ( params ) {
    resp = await axios_.get( API_HOST + uri, { params })
  }
  else {
    resp = await axios_.get( API_HOST + uri )
  }
  return resp
}

export const post = async ( uri, data ) => {
  let resp
  if ( data ) {
    const isFormData = data instanceof FormData
    resp = isFormData
      ? await axios_.post( API_HOST + uri, data )
      : await axios_.post( API_HOST + uri, data, {
        headers: {
          "Content-Type": "application/json",
        },
      })
  }
  else {
    resp = await axios_.post( uri )
  }
  return resp
}

export const put = async ( uri, data, opts ) => {
  let resp
  const url = opts?.isUrl ? uri : API_HOST + uri

  if ( data ) {
    const isFormData = data instanceof FormData
    resp = isFormData
      ? await axios_.put( url, data )
      : await axios_.put( url, data, {
        headers: {
          "Content-Type": "application/json",
        },
      })
  }
  else {
    resp = await axios_.put( uri )
  }
  return resp
}

export const del = async ( uri, params ) => {
  let resp
  if ( params ) {
    resp = await axios_.delete( API_HOST + uri, { params })
  }
  else {
    resp = await axios_.delete( API_HOST + uri )
  }
  return resp
}