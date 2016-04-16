var async = require('./async')
var Row = require('./row')

// TODO: if the primary key value changes, refresh old and new cache
module.exports = function(params, cb) {
  var self = this
  var data = self
  var table = self._table
  var db = table.db
  var iq = db._platform.identifierQuoteChar

  params = params || {}
  if (typeof params === 'function') {
    cb = params
    params = {}
  }
  cb = cb || db._promiseResolver()

  var client = params.client
  var topLevel = false

  // get the properties that have data
  var properties = []
  table.columns.forEach(function(column) {
    if (typeof data[column.name] !== 'undefined') {
      // don't save data that hasn't changed
      // (self._data is a snapshot from the time of Row instatiation)
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
      if (!client) {
        topLevel = true
        var conn = db._query.getConn({write: true})
        db._platform.getClient(conn, function(err, _client, _release) {
          client = _client
          client._release = _release
          client._nestedTransactionCount = 0
          next(err)
        })
        return
      }
      next(null)
    },

    // begin transaction
    function(next) {
      client._nestedTransactionCount++
      if (client._nestedTransactionCount === 1) {
        return db._platform.beginTransaction(client, next)
      }
      next(null)
    },

    // save 1-to-1 nested objects
    function(next) {
      async.each(Object.keys(table.fk), function(name, nextFk) {
        if (data[name] && isObject(data[name])) {
          var foreignTable = db[table.fk[name].foreignTable]
          var foreignRow = new Row(data[name], foreignTable)
          foreignRow.save({client: client}, function(err, savedRow) {
            if (err) return nextFk(err)
            // get the newly inserted foreign key so it gets linked to this main row
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

    // save this main row
    function(next) {

      var set = []
      properties.forEach(function(field) {
        set.push(iq + field + iq + ' = :' + field)
      })
      if (set.length === 0) return next()

      // insert or update
      db._platform.upsert(client, {
        table: table.name,
        set: set,
        properties: properties,
        pkWhere: pkWhere,
        data: data
      }, function(err, row) {
        if (err) {
          err.save = {
            table: table.name,
            data: data
          }
          return next(err)
        }
        result = row
        next(null)
      })

    },

    // save 1-to-many arrays of nested objects
    function(next) {
      async.each(Object.keys(data), function (field, done) {
        var foreignRowsName = self.getForeignRowsName(field)
        if (!foreignRowsName) return done(null)
        if (!isArray(data[field])) return done(new Error(table.name+'.'+field+' must be an array.'))
        // we found a data field that is a valid 1-to-m array of foreign data rows
        var parts = foreignRowsName.split(':')
        var fkName = parts[0]
        var mTable = parts[1]
        var fk = db[mTable].fk[fkName]
        async.each(data[field], function (rowData, rowDone) {
          // set the foreign key value(s)
          fk.columns.forEach(function (col, i) {
            var fkVal = result[fk.foreignColumns[i]]
            if (rowData[col] && rowData[col] !== fkVal) {
              return rowDone(new Error('Modifying foreign key "'+mTable+'.'+col+'" is not permitted.'))
            }
            rowData[col] = fkVal
          })
          var foreignRow = new Row(rowData, db[mTable])
          foreignRow.save({client: client}, function (err, savedRow) {
            rowDone(err)
          })
        }, done)
      }, function (err) {
        if (err) return next(err)
        next(null)
      })
    },

    // commit transaction
    function(next) {
      client._nestedTransactionCount--
      if (client._nestedTransactionCount === 0) {
        return db._platform.commitTransaction(client, function(err) {
          next(err)
        })
      }
      next(null)
    }
  ],

  function(err) {
    if (err) {
      // rollback transaction
      if (!db._opts.silent) {
        console.log('\033[31m' + 'Save Error:', err.save)
        console.log('SQL Error:', err.message)
        console.log('Rollback Transaction' + '\033[0m')
      }
      client._nestedTransactionCount = 0
      if (topLevel) {
        db._platform.rollbackTransaction(client, function(rollbackError) {
          client._release()
          if (rollbackError) return cb(rollbackError)
          cb(err)
        })
      }
      return
    }

    if (topLevel) {
      client._release()
    }
    var savedRow = Row(result, db[table.name])

    // invalidate the memoization
    savedRow._table.invalidateMemo(pk)
    var opts = self._table.db._opts
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

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isObject(obj) {
  return toString.call(obj) === '[object Object]'
}
