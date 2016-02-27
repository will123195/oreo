module.exports = function(obj, prop) {
  Object.defineProperty(obj, prop, {
    enumerable: false,
    writable: true
  })
}