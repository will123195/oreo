var async = require('async')
var Row = require('./row')

// TODO: if the primary key value changes, refresh old and new cache
module.exports = function(cb) {
  var self = this
  var data = self
  var table = self._meta
  var db = table.db

  cb = cb || db._promiseResolver()

  // get the properties that have data
  var properties = []
  table.columns.forEach(function(column) {
    if (typeof data[column.name] !== 'undefined') {
      // don't save data that hasn't changed (self._data is set by get())
      if (data[column.name] !== self._data[column.name]) {
        properties.push(column.name)
      }
    }
  })

  var pk = self.getPrimaryKey()
  var pkWhere = false
  var isInsert = false
  if (Object.keys(pk).length === 0) {
    isInsert = true
  }
  Object.keys(pk).forEach(function(key) {
    if (!pk[key]) isInsert = true
  })
  if (!isInsert) {
    pkWhere = table.getPrimaryKeyWhereClause(pk)
  }

  var result

  async.series([

    // get a db client - since we're using a transaction, we have to make
    // sure we're not getting different connections from the db conn pool
    function(next) {
      if (!self._client) {
        var conn = db._query.getConn({write: true})
        db._platform.getClient(conn, function(err, client, release) {
          self._client = client
          self._release = release
          next(err)
        })
        return
      }
      next(null)
    },

    // begin transaction
    function(next) {
      self._nestedTransactionCount++
      if (self._nestedTransactionCount === 1) {
        return db._platform.beginTransaction(self._client, next)
      }
      next(null)
    },

    // save 1-to-1 nested objects
    function(next) {
      async.eachSeries(Object.keys(table.fk), function(name, nextFk) {
        if (data[name]) {
          var foreignTable = db[table.fk[name].foreignTable]
          var foreignRow = new Row(data[name], foreignTable)
          foreignRow.save(function(err, savedRow) {
            if (err) return nextFk(err)
            table.fk[name].columns.forEach(function(column, i) {
              data[column] = savedRow[table.fk[name].foreignColumns[i]]
              if (properties.indexOf(column) === -1) {
                properties.push(column)
              }
            })
            nextFk(null)
          })
        } else {
          nextFk(null)
        }
      }, next)
    },

    // save this main object
    function(next) {

      var set = []
      properties.forEach(function(field) {
        set.push(field + ' = :' + field)
      })
      if (set.length === 0) return next()

      // insert or update (upsert)
      db._platform.upsert(self._client, {
        table: table.name,
        set: set,
        properties: properties,
        pkWhere: pkWhere,
        data: data
      }, function(err, row) {
        if (err) return next(err)
        result = row
        next(null)
      })

    },

    // save 1-to-many arrays of nested objects
    function(next) {
      // TODO
      next()
    },

    // commit transaction
    function(next) {
      self._nestedTransactionCount--
      if (self._nestedTransactionCount === 0) {
        return db._platform.commitTransaction(self._client, function(err) {
          self._release()
          delete self._client
          delete self._release
          next(err)
        })
      }
      next(null)
    }
  ],

  function(err) {
    if (err) {
      // rollback transaction
      console.log(table.name + ': invalid data')
      console.log(data)
      console.log('-----')
      console.log('SQL error:', err.message)
      console.log('rollback', table.name)
      self.nestedTransactionCount = 0
      db._platform.rollbackTransaction(self._client, function(rollbackError) {
        if (rollbackError) return cb(rollbackError)
        cb(err)
      })
      return
    }

    var savedRow = new Row(result, db[table.name])

    // invalidate the memoization
    savedRow._meta.invalidateMemo(pk)
    var opts = self._meta.db._opts
    if (!opts.cache || typeof opts.cache.set !== 'function') {
      return cb(null, savedRow)
    }

    // save to cache
    var cacheKey = savedRow.getCacheKey()
    opts.cache.set(cacheKey, JSON.stringify(result), function(err) {
      if (err) return cb(err)
      cb(null, savedRow)
    })
  })

  return cb.promise ? cb.promise : this
}
