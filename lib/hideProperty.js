module.exports = function(obj, prop) {
  if (!obj) return
  Object.defineProperty(obj, prop, {
    enumerable: false,
    writable: true
  })
}
