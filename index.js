var pg = require('pg')
var async = require('async')
var Table = require('./table')
var wrap = require('thunkify-wrap')
// var EventEmitter = require('events').EventEmitter
//  var util = require('util')

var oreo = module.exports = function oreo(opts) {
  if (!(this instanceof oreo)) {
    return new oreo(opts)
  }

  var self = this
  self._tables = []
  this.execute = query()

  if (true) {
    this.exec = wrap(this.execute)
  }

  function query() {

    var conString = [
      'postgres://', opts.user, ':', opts.pass, '@', opts.hosts[0], '/', opts.name
    ].join('')

    return function(sql, values,  cb) {

      if (typeof sql !== 'string' && !isArray(sql)) {
        return cb(new Error('sql must be string or array multiline string'))
      }

      if (typeof values === 'function') {
        cb = values
        values = undefined
      }

      if (isArray(sql)) {
        sql = sql.join('\n')
      }

      if (values) {
        sql = queryValues(sql, values)
      }

      pg.connect(conString, function(err, client, done) {
        if (err) {
          cb(err)
          return console.error('error fetching client from pool', err)
        }
        client.query({
          text: sql
          //values: values
        }, function(err, result) {
          //call `done()` to release the client back to the pool
          done()

          if (err) {
            console.log(sql);
            console.error('error running query', err)
            return cb(err)
          }

          //console.log('sql:', sql);
          // console.log('rows:', result.rows);

          cb(null, result.rows)
        })
      })
    }
  }

}


// based on https://github.com/felixge/node-mysql#custom-format
// TODO: replace sequentially with $1, $2, etc instead of actual values
// (sql injection prevention)
var queryValues = function (query, values) {
  if (!values) return query;
  return query.replace(/\:(\w+)/g, function (txt, key) {
    if (values.hasOwnProperty(key)) {
      if (typeof values[key] !== 'string') {
        return values[key];
      }
      return "'" + values[key].replace(/'/g, "''") + "'";
    }
    return txt;
  });
};


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

      if (true) {
        self[table_name] = wrap(self[table_name])
      }

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

function isArray(value) {
  return (Object.prototype.toString.call(value) === '[object Array]')
}