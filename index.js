var query = require('./query')
var async = require('async')
var Table = require('./table')

var debug = false

//var wrap = require('thunkify-wrap')
// var EventEmitter = require('events').EventEmitter
//  var util = require('util')

var oreo = module.exports = function oreo(opts) {
  if (!(this instanceof oreo)) {
    return new oreo(opts)
  }

  var self = this
  self._tables = []


  opts.debug = debug
  this.execute = query(opts)

  // if (true) {
  //   this.exec = wrap(this.execute)
  // }



}





/**
 * [discover description]
 */
oreo.prototype.discover = function(cb) {
  if (this._tables.length > 0) return

  cb = cb || function(){}
  var sql
  var self = this

  // get the tables
  sql = "\
    SELECT table_name \
    FROM information_schema.tables \
    WHERE table_schema = 'public' \
  "
  this.execute(sql, function(err, rs) {
    if (err) return cb(err)

    // for each table
    async.eachSeries(rs, function(r, cb) {
      var table_name = r.table_name
      self._tables.push(table_name)
      // create a table object
      self[table_name] = new Table(table_name, self.execute, cb)
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
            self[fk.foreign_table_name].many = self[fk.foreign_table_name].many || []
            self[fk.foreign_table_name].many.push(fk)
          })
        }
      })

      cb(null, self)
    })
  })
}


//util.inherits(oreo, EventEmitter)

