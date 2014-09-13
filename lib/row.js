var async = require('async')
var hide = require('hide-property')

var Row = module.exports = function Row(rs, table) {
  var self = this
  if (!(self instanceof Row)) {
    return new Row(rs, table)
  }

  rs = rs || {}

  hide(self, '_meta')
  hide(self, '_data')

  self._meta = table
  // take a snapshot of the data so we only save() what is changed
  self._data = JSON.parse(JSON.stringify(rs))

  for (var attr in rs) {
    self[attr] = rs[attr]
  }

  if (table.construct && typeof table.construct === 'function') {
    table.construct.call(self)
  }

  // bind user defined row methods to this row instance
  Object.keys(table._methods).forEach(function(method) {
    self[method] = table._methods[method].bind(self)
  })
}


Row.prototype.dump = function() {
  console.log(this._meta.name + '(' +  this.getPrimaryKey() + '):', this);
}

Row.prototype.set = function(data) {
  var self = this
  Object.keys(data).forEach(function(field) {
    self._data[field] = self[field]
    self[field] = data[field]
  })
}

// TODO: replace this with persist()
Row.prototype.save = function(cb) {
  var self = this
  var update = {}
  // if the data hasn't changed, don't update
  Object.keys(self._data).forEach(function(field) {
    if (self[field] !== self._data[field]) {
      update[field] = self[field]
    }
  })
  self.update(update, cb)
}

Row.prototype.hydrate = function(fkName, cb) {
  var self = this
  if (self._meta.fk && self._meta.fk[fkName]) {
    var fk = self._meta.fk[fkName]
    var property = fk.constraintName
    var fkTable = fk.foreignTable
    var fkPk = {}
    fk.columns.forEach(function(column, i) {
      fkPk[fk.foreignColumns[i]] = self[column]
    })
    table.db[fkTable].get(fkPk, function(err, obj) {
      if (err) return cb(err)
      self[fkName] = obj
      cb(null, obj)
    })
  }
}


Row.prototype.getPrimaryKey = function() {
  var self = this
  var pk = {}
  self._meta.primaryKey.forEach(function(field) {
    pk[field] = self[field]
  })
  return pk
}


Row.prototype.getCacheKey = function() {
  var self = this
  var pk = self.getPrimaryKey()
  var cacheKey = ''
  Object.keys(pk).forEach(function(k) {
    var val = pk[k]
    if (cacheKey) cacheKey = cacheKey + ','
    cacheKey = cacheKey + val
  })
  cacheKey = self._meta.name + ':' + cacheKey
  return cacheKey
}


// TODO: replace this with: Row().save()
// TODO: if the primary key value changes, refresh old and new cache
Row.prototype.update = function(data, cb) {
  var self = this
  // remove undefined values
  data = JSON.parse(JSON.stringify(data))
  var set = []
  Object.keys(data).forEach(function(field) {
    set.push(field + ' = :' + field)
  })
  var pk = self.getPrimaryKey()
  var pkWhere = table.getPrimaryKeyWhereClause(pk)
  var sql = [
    'UPDATE "' + this._meta.name + '"',
    'SET ' + set.join(',\n'),
    'WHERE ' + pkWhere,
    'RETURNING *'
  ].join('\n');
  self._meta.db.execute(sql, data, {write: true}, function(err, rs) {
    if (err) return cb(err)
    // reinstantiate this object with the updated values
    self = new Row(rs[0], self._meta)
    // invalidate the memoization
    self._meta.invalidateMemo(pk)
    var opts = self._meta.db._opts
    if (!opts.cache || typeof opts.cache.set !== 'function') {
      return cb(null, self)
    }
    // save to cache
    var cacheKey = self.getCacheKey()
    opts.cache.set(cacheKey, JSON.stringify(rs[0]), function(err) {
      if (err) return cb(err)
      cb(null, self)
    })
  })
}


/**
 *
 */
Row.prototype.persist = function(cb) {
  var self = this
  var table = self._meta
  // remove undefined values
  var data = JSON.parse(JSON.stringify(self))
  // get the properties that have data
  var properties = []
  table.columns.forEach(function(column) {
    if (typeof data[column.name] !== 'undefined') {
      properties.push(column.name)
    }
  })

  // TODO: don't save data that hasn't changed

  var db = table.db
  var query = db.execute
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
    // begin transaction
    function(next) {
      db._platform.beginTransaction(next)
    },
    // save 1-to-1 nested objects
    function(next) {
      async.eachSeries(Object.keys(table.fk), function(name, nextFk) {
        if (data[name]) {
          var foreignTable = db[table.fk[name].foreignTable]
          var foreignRow = new Row(data[name], foreignTable)
          foreignRow.persist(function(err, savedRow) {
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


      // TODO: use this and break out code below into pg.js
      // // insert or update (upsert)
      // db._platform.upsert({
      //   table: table.name,
      //   data: {},
      //   primaryKey: pk
      // }, function(err, row) {
      //   if (err) return next(err)
      //   result = row
      //   next(null)
      // })



      var update = [
        'UPDATE "' + table.name + '"',
        'SET ' + set.join(',\n'),
        'WHERE ' + pkWhere,
        'RETURNING *'
      ].join('\n')

      var insert = [
        'INSERT INTO "' + table.name + '"',
        '(' + properties.join(', ') + ')',
        'SELECT',
        ':' + properties.join(', :'),
        "WHERE NOT EXISTS (SELECT * FROM upd)",
        "RETURNING *"
      ].join('\n')

      var upsert = [
        "WITH",
        "upd AS (" + update + "),",
        "ins AS (" + insert + ")",
        "SELECT * FROM upd UNION SELECT * FROM ins"
      ]

      query(upsert, data, {write: true}, function(err, rs) {
        if (err) return next(err)
        result = rs[0]
        next()
      })

    },
    // save 1-to-many arrays of nested objects
    function(next) {
      next()
    },
    // commit transaction
    function(next) {
      db._platform.commitTransaction(next)
    }
  ], function(err) {
    if (err) {
      // rollback transaction
      console.log('error:', err)
      console.log('rollback', table.name)
      db._platform.rollbackTransaction(function(rollbackError) {
        if (rollbackError) return cb(rollbackError)
        cb(err)
      })
      return
    }
    var savedRow = new Row(result, db[table.name])
    cb(null, savedRow)
  })
}
