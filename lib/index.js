var query = require('./query')
var async = require('async')
var Table = require('./table')
var hide = require('hide-property')

var supportedDrivers = [
  'pg',
  //'mysql'
]

var oreo = module.exports = function oreo(opts, cb) {
  if (!(this instanceof oreo)) {
    return new oreo(opts, cb)
  }

  var self = this

  hide(self, '_driver')
  hide(self, '_platform')
  hide(self, '_query')

  if (supportedDrivers.indexOf(opts.driver) === -1) {
    return cb(new Error('"' + opts.driver + '" is not a supported driver.'))
  }

  self._driver = require(opts.driver)

  // bind the platform-specific methods to this
  self._platform = require('./platforms/' + opts.driver)
  self._platform.db = self

  // use _ prefix to avoid conflict with table names
  self._tables = []
  self._opts = opts

  opts.debug = opts.debug || false

  if (typeof opts.memoize === 'undefined' || opts.memoize > 0) {
    opts.memoize = opts.memoize || 150
  } else {
    opts.memoize = false
  }

  self._query = query(self, opts, function() {
    self._opts.pass = '***************' // obfuscate the password
    self.execute = self._query.execute.bind(self._query)
    self.discover(cb)
  })

}


/**
 * [discover description]
 */
oreo.prototype.discover = function(cb) {

  cb = cb || function(){}
  var sql
  var self = this
  self._tables = []

  // get the tables
  self._platform.getTables(function(err, tables) {
    if (err) return cb(err)

    // for each table
    async.eachSeries(tables, function(table_name, callback) {
      self._tables.push(table_name)
      // create a table object
      self[table_name] = new Table(table_name, self, callback)

    }, function(err) {
      if (err) return cb(err)

      // determine the 1-to-m relationships for each table
      self._tables.forEach(function(table) {
        if (self[table].fk) {
          Object.keys(self[table].fk).forEach(function(fkName) {
            var fk = self[table].fk[fkName]
            self[fk.foreignTable].many = self[fk.foreignTable].many || []
            var link = fk.constraintName + '_' + fk.table
            self[fk.foreignTable].many[link] = fk
          })
        }
      })

      cb(null, self)
    })
  })
}


