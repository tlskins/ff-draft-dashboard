
export const predBgColor = "bg-gray-400"
export const nextPredBgColor = "bg-gray-600"

export const getTierStyle = tier => {
  switch(parseInt(tier)) {
    case 1:
      return "bg-yellow-50 text-black"
    case 2:
      return "bg-yellow-100 text-black"
    case 3:
      return "bg-yellow-200 text-black"
    case 4:
      return "bg-yellow-300 text-black"
    case 5:
      return "bg-yellow-400 text-black"
    case 6:
      return "bg-yellow-500 text-black"
    case 7:
      return "bg-yellow-600 text-black"
    case 8:
      return "bg-yellow-700 text-white"
    case 9:
      return "bg-yellow-800 text-white"
    case 10:
      return "bg-yellow-900 text-white"
    default:
      return ""
  }
}

export const getPosStyle = position => {
  switch(position) {
    case "QB":
      return "bg-yellow-300 shadow-md"
    case "RB":
      return "bg-blue-300 shadow-md"
    case "WR":
      return "bg-green-300 shadow-md"
    case "TE":
      return "bg-red-300 shadow-md"
    default:
      return ""
  }
}

export const getPickDiffColor = pickDiff => {
  const absDiff = Math.abs( pickDiff )
  let colorShade = ''
  if ( absDiff <= 2 ) {
    colorShade = '300'
  } else if ( absDiff <= 5 ) {
    colorShade = '400'
  } else if ( absDiff <= 9 ) {
    colorShade = '500'
  } else if ( absDiff <= 14 ) {
    colorShade = '600'
  } else {
    colorShade = '700'
  }

  return `bg-${pickDiff > 0 ? 'red' : 'green'}-${colorShade}`
}