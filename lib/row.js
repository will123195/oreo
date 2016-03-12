var hide = require('./hideProperty')
var async = require('async')

var Row = module.exports = function Row(rs, table) {
  var self = this
  if (!(self instanceof Row)) {
    var model = table.name && table.db.models && table.db.models[table.name]
    if (model && typeof model === 'function') {
      return new model(rs, table)
    }
    return new Row(rs, table)
  }

  rs = rs || {}

  hide(self, '_data')
  hide(self, '_meta')

  // take a snapshot of the data so we only save() what is changed
  //self._data = JSON.parse(JSON.stringify(rs))
  self._data = self._data || {}
  self._meta = table

  for (var attr in rs) {
    self[attr] = rs[attr]
  }

  // DEPRECATED
  if (table.construct && typeof table.construct === 'function') {
    table.construct.call(self)
  }

  // DEPRECATED
  // bind user defined row methods to this row instance
  Object.keys(table._methods).forEach(function(method) {
    self[method] = table._methods[method].bind(self)
  })
}


Row.prototype.dump = function() {
  console.log(this._meta.name + '(' +  this.getPrimaryKey() + '):', this);
}


Row.prototype.getForeignRows = function(foreignRowsName, cb) {
  var self = this
  var db = self._meta.db
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
  var db = self._meta.db
  if (self._meta.fk[fkName]) {
    return false
  }
  var colExists = !!self._meta.columns.filter(function (col) {
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
    if (fk[foreignRowsName].foreignTable === self._meta.name) {
      return fkName
    }
    throw new Error('The foreign key specified is not linked to this row.')
  }
  var found = 0
  Object.keys(fk).forEach(function (name) {
    if (fk[name].foreignTable === self._meta.name) {
      found++
      fkName = name + ':' + table
    }
  })
  if (found > 1) {
    throw new Error("hydrate('" + table + "') is ambiguous. Try something like '" + fkName + "'")
  }
  return fkName
}


Row.prototype.hydrate = function(fkNames, cb) {
  var self = this
  var db = self._meta.db
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
    if (!self._meta.fk || !self._meta.fk[fkName]) {
      return cb(new Error(self._meta.name + '.' + fkName + ' is not hydratable.'))
    }
    var fk = self._meta.fk[fkName]
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
    self._meta.db[fkTable].get(fkPk, function(err, obj) {
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
  if (!self._meta.primaryKey) return pk
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
  var db = self._meta.db
  cb = cb || db._promiseResolver()
  Object.keys(data).forEach(function(key) {
    self[key] = data[key]
  })
  self.save(cb)
  return cb.promise ? cb.promise : this
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}