var async = require('./lib/async')
var query = require('./lib/query')
var Table = require('./lib/table')
var hide = require('./lib/hideProperty')
var promiseResolver = require('./lib/promiseResolver')
var extend = require('./lib/extend')

var supportedDrivers = [
  'pg',
  'mysql'
]

var oreo = module.exports = function oreo(opts, cb) {
  if (!(this instanceof oreo)) {
    return new oreo(opts, cb)
  }

  opts = opts || {}
  cb = cb || function () {}

  var self = this

  // use _ prefix to avoid conflict with table names
  hide(self, '_driver')
  hide(self, '_platform')
  hide(self, '_query')
  hide(self, '_tables')
  hide(self, '_opts')
  hide(self, '_Promise')
  hide(self, '_promiseResolver')
  hide(self, '_onReady')
  hide(self, '_isReady')
  hide(self, '_memo')

  self._isReady = false
  self._tables = []
  self._opts = extend({}, opts)
  self._Promise = opts.Promise
  self._promiseResolver = promiseResolver
  self._memo = {} // memoized query results

  if (supportedDrivers.indexOf(opts.driver) === -1) {
    return cb(new Error('"' + opts.driver + '" is not a supported driver.'))
  }

  self._driver = require(opts.driver)

  // bind the platform-specific methods to this
  self._platform = require('./lib/platforms/' + opts.driver)
  self._platform.db = self

  if (opts.debug && typeof opts.debug !== 'function') {
    self._opts.debug = console.log
  }

  if (typeof opts.memoize !== 'number') {
    self._opts.memoize = false
  }

  self._query = query(self, self._opts, function(err) {
    if (err) {
      return cb(err)
    }
    self._opts.pass = '***************' // obfuscate the password
    self.execute = self._query.execute.bind(self._query)
    self.executeWrite = self._query.executeWrite.bind(self._query)
    if (opts.schema) {
      return self.discover({
        fromCache: true
      }, cb)
    }
    self.discover(cb)
  })

  // purge memoized values periodically
  var memoMs = self._opts.memoize
  if (memoMs) {
    var intervalMs = self._opts.memoizePurgeInterval || 10000
    setInterval(function purgeMemo () {
      Object.keys(self._memo).forEach(function (key) {
        if (Date.now() - self._memo[key].timestamp > memoMs) {
          delete self._memo[key]
        }
      })
    }, intervalMs)
  }

  return this
}

/**
 * [discover description]
 */
oreo.prototype.discover = function(opts, cb) {
  var sql
  var self = this
  self._tables = []

  opts = opts || {}
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  cb = cb || self._promiseResolver()

  // get the tables from db or cache
  var getTables = self._platform.getTables.bind(self._platform)
  if (opts.fromCache) {
    getTables = function (cb) {
      return cb(null, Object.keys(self._opts.schema))
    }
  }
  getTables(function(err, tables) {
    if (err) return cb(err)

    // for each table
    async.each(tables, function(tableName, done) {
      self._tables.push(tableName)
      // create a table object
      self[tableName] = new Table({
        tableName: tableName,
        db: self,
        fromCache: opts.fromCache
      }, done)

    }, function(err) {
      if (err) return cb(err)

      // determine the 1-to-m relationships for each table
      self._tables.forEach(function(table) {
        if (self[table].fk) {
          Object.keys(self[table].fk).forEach(function(fkName) {
            var fk = self[table].fk[fkName]
            if (self[fk.foreignTable] && self[fk.foreignTable].many) {
              var link = fk.constraintName + '_' + fk.table
              self[fk.foreignTable].many[link] = fk
            }
          })
        }
      })

      self._onReady = self._onReady || []
      self._onReady.forEach(function (fn) {
        fn()
      })
      self._isReady = true

      cb(null, self)
    })
  })

  return cb.promise ? cb.promise : this
}

/**
 * Adds a function to the stack to be executed when the database is ready
 */
oreo.prototype.onReady = function(fn) {
  if (this._isReady) {
    return fn()
  }
  this._onReady = this._onReady || []
  this._onReady.push(fn)
  return this
}

/**
 *
 */
oreo.prototype.end = function(cb) {
  cb = cb || function () {}
  this._platform.end(cb)
}
