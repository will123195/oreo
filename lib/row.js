var hide = require('./hideProperty')

var Row = module.exports = function Row(rs, table) {
  var self = this
  if (!(self instanceof Row)) {
    if (table.Row && typeof table.Row === 'function') {
      return new table.Row(rs, table)
    }
    return new Row(rs, table)
  }

  rs = rs || {}

  hide(self, '_data')
  hide(self, '_meta')
  hide(self, '_nestedTransactionCount')
  hide(self, '_client')
  hide(self, '_release')


  // take a snapshot of the data so we only save() what is changed
  //self._data = JSON.parse(JSON.stringify(rs))
  self._data = self._data || {}
  self._meta = table
  self._nestedTransactionCount = 0

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


Row.prototype.hydrate = function(fkName, cb) {
  var self = this
  var db = self._meta.db
  cb = cb || db._promiseResolver()
  if (!self._meta.fk || !self._meta.fk[fkName]) {
    return cb(new Error('invalid fk:', fkName))
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
  if (invalidPk) return cb(null)
  self._meta.db[fkTable].get(fkPk, function(err, obj) {
    if (err && !err.notFound) return cb(err)
    self[fkName] = obj
    cb(null)
  })
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


Row.prototype.save = function(cb) {
  return this._save(cb)
}


Row.prototype._save = require('./save')


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
  self._save(cb)
  return cb.promise ? cb.promise : this
}

