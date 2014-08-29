var query = require('./lib/query')
var async = require('async')
var Table = require('./lib/table')

var debug = false

//var wrap = require('thunkify-wrap')
// var EventEmitter = require('events').EventEmitter
//  var util = require('util')

var oreo = module.exports = function oreo(opts, cb) {
  if (!(this instanceof oreo)) {
    return new oreo(opts, cb)
  }

  var self = this
  self._tables = []

  opts.debug = debug
  self.execute = query(opts, function(err) {
    if (err) return cb(err)
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
          self[table].fk.forEach(function(fk) {
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

