var query = require('./query')
var async = require('async')
var Table = require('./table')

//var wrap = require('thunkify-wrap')
// var EventEmitter = require('events').EventEmitter
//  var util = require('util')

var oreo = module.exports = function oreo(opts, cb) {
  if (!(this instanceof oreo)) {
    return new oreo(opts, cb)
  }

  var self = this

  // use _ prefix to avoid conflict with table names
  self._tables = []
  self._opts = opts

  opts.debug = opts.debug || false
  
  if (typeof opts.memoize === 'undefined' || opts.memoize > 0) {
    opts.memoize = opts.memoize || 150
  } else {
    opts.memoize = false
  }

  self.execute = query(opts, function(err) {
    if (err) return cb(err)
    self._opts.pass = '***************'
    self.discover(cb)
  })

  // if (true) {
  //   this.exec = wrap(this.execute)
  // }
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
  sql = [
    'SELECT table_name',
    'FROM information_schema.tables',
    "WHERE table_schema = 'public'"
  ]
  this.execute(sql, function(err, rs) {
    if (err) return cb(err)

    // for each table
    async.eachSeries(rs, function(r, callback) {
      var table_name = r.table_name
      self._tables.push(table_name)
      // create a table object
      self[table_name] = new Table(table_name, self.execute, callback)
      self[table_name].orm = self

      // if (true) {
      //   self[table_name] = wrap(self[table_name])
      // }

    }, function(err) {
      if (err) return cb(err)

      // determine the 1-to-m relationships for each table
      self._tables.forEach(function(table) {
        if (self[table].fk) {
          Object.keys(self[table].fk).forEach(function(fkName) {
            var fk = self[table].fk[fkName]
            self[fk.foreignTable].many = self[fk.foreignTable].many || []
            self[fk.foreignTable].many.push(fk)
          })
        }
      })

      cb(null, self)
    })
  })
}


//util.inherits(oreo, EventEmitter)

