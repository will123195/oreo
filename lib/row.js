var hide = require('./hideProperty')
var async = require('./async')
var extend = require('./extend')

var Row = module.exports = function Row(data, table) {
  var self = this
  if (table.Row && typeof table.Row === 'function') {
    var model = function () {}
    var rowPrototype = extend({}, Row.prototype)
    model.prototype = new table.Row(data, table)
    extend(model.prototype, rowPrototype)
    var newRow = new model(data, table)
    newRow.initialize(data, table)
    return newRow
  }
  if (!(self instanceof Row)) {
    return new Row(data, table)
  }
  self.initialize(data, table)
}


Row.prototype.initialize = function (data, table) {
  var self = this
  data = data || {}

  hide(self, '_data')
  hide(self, '_table')

  // take a snapshot of the data so we only save() what is changed
  self._data = self._data || {}
  self._table = table

  for (var attr in data) {
    self[attr] = data[attr]
  }
}


Row.prototype.dump = function() {
  console.log(this._table.name + '(' +  this.getPrimaryKey() + '):', this);
}


Row.prototype.getForeignRows = function(foreignRowsName, cb) {
  var self = this
  var db = self._table.db
  var parts = foreignRowsName.split(':')
  var fkName = parts[0]
  var table = parts[1]
  var fk = db[table].fk[fkName]
  var where = {}
  fk.columns.forEach(function (col, i) {
    where[col] = self[fk.foreignColumns[i]]
  })
  db[table].find({
    where: where
  }, cb)
}


Row.prototype.getForeignRowsName = function(fkName) {
  var self = this
  var db = self._table.db
  if (self._table.fk[fkName]) {
    return false
  }
  var colExists = !!self._table.columns.filter(function (col) {
    return col.name === fkName
  }).length
  if (colExists) {
    return false
  }
  var foreignRowsName
  var parts = fkName.split(':')
  var table = parts[0]
  if (parts.length > 1) {
    foreignRowsName = parts[0]
    table = parts[1]
  }
  if (!db[table]) {
    return false
  }
  var fk = db[table].fk
  if (foreignRowsName) {
    if (fk[foreignRowsName].foreignTable === self._table.name) {
      return fkName
    }
    throw new Error('The foreign key specified is not linked to this row.')
  }
  var found = 0
  Object.keys(fk).forEach(function (name) {
    if (fk[name].foreignTable === self._table.name) {
      found++
      foreignRowsName = name + ':' + table
    }
  })
  if (found > 1) {
    throw new Error("hydrate('" + table + "') is ambiguous. Try something like '" + fkName + "'")
  }
  return foreignRowsName || false
}


Row.prototype.hydrate = function(fkNames, cb) {
  var self = this
  var db = self._table.db
  cb = cb || db._promiseResolver()
  if (!isArray(fkNames)) {
    fkNames = [fkNames]
  }
  async.each(fkNames, function (fkName, done) {
    var foreignRowsName = self.getForeignRowsName(fkName)
    if (foreignRowsName) {
      self.getForeignRows(foreignRowsName, function (err, rows) {
        if (err) return done(err)
        self[fkName] = rows
        done(null)
      })
      return
    }
    if (!self._table.fk || !self._table.fk[fkName]) {
      return cb(new Error(self._table.name + '.' + fkName + ' is not hydratable.'))
    }
    var fk = self._table.fk[fkName]
    var property = fk.constraintName
    var fkTable = fk.foreignTable
    var fkPk = {}
    fk.columns.forEach(function(column, i) {
      fkPk[fk.foreignColumns[i]] = self[column]
    })
    var invalidPk = false
    Object.keys(fkPk).forEach(function(prop) {
      var val = fkPk[prop]
      if (val === null || typeof val === 'undefined') {
        invalidPk = true
      }
    })
    if (invalidPk) return done(null)
    self._table.db[fkTable].get(fkPk, function(err, obj) {
      if (err && !err.notFound) return done(err)
      self[fkName] = obj
      done(null)
    })
  }, cb)
  return cb.promise ? cb.promise : this
}


Row.prototype.getPrimaryKey = function() {
  var self = this
  var pk = {}
  if (!self._table.primaryKey) return pk
  self._table.primaryKey.forEach(function(field) {
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
  cacheKey = self._table.name + ':' + cacheKey
  return cacheKey
}


Row.prototype.save = require('./save')


Row.prototype.set = function(data) {
  var self = this
  Object.keys(data).forEach(function(field) {
    self._data[field] = self[field]
    self[field] = data[field]
  })
}


Row.prototype.update = function(data, cb) {
  var self = this
  var db = self._table.db
  cb = cb || db._promiseResolver()
  Object.keys(data).forEach(function(key) {
    self[key] = data[key]
  })
  self.save(cb)
  return cb.promise ? cb.promise : this
}

Row.prototype.delete = function (opts, cb) {
  var self = this
  var table = self._table
  var db = table.db
  opts = opts || {}
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  cb = cb || db._promiseResolver()
  var pk = self.getPrimaryKey()
  var where = table.getPrimaryKeyWhereClause(pk)
  var cacheKey = self.getCacheKey()
  var sql = [
    'DELETE FROM ' + table.name,
    'WHERE ' + where
  ]
  db.execute(sql, function (err) {
    if (err) return cb(err)
    // invalidate memoization
    self._table.invalidateMemo(pk)
    // delete self
    Object.keys(self).forEach(function (key) {
      delete self[key]
    })
    // invalidate the cache
    var cache = db._opts.cache
    if (!cache || typeof cache.set !== 'function') {
      return cb(null)
    }
    cache.set(cacheKey, null, function(err) {
      if (err) return cb(err)
      cb(null)
    })
  })
  return cb.promise ? cb.promise : this
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}
