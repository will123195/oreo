module.exports = function promise () {
  var Promise = this._Promise || global.Promise
  if (!Promise) {
    throw new Error('No callback provided and no Promise library specified.')
  }
  var resolver
  var promise = new Promise(function (resolve, reject) {
    resolver = function (err, data) {
      if (err) {
        return reject(err)
      }
      return resolve(data)
    }
  })
  resolver.promise = promise
  return resolver
}

