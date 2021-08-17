
export const HandleError = (error) => {
  console.log("HandleError", error)

  return error.response?.data?.message || ""
}

