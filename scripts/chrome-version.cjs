const isChromeExtensionVersion = version => {
  if (typeof version !== "string") return false
  const components = version.split(".")
  if (components.length < 1 || components.length > 4) return false
  if (!components.every(component => /^(0|[1-9]\d*)$/.test(component) && Number(component) <= 65535)) return false
  return components.some(component => Number(component) !== 0)
}

module.exports = { isChromeExtensionVersion }
