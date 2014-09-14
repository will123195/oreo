var hide = require('hide-property')

var Row = module.exports = function Row(rs, table) {
  var self = this
  if (!(self instanceof Row)) {
    return new Row(rs, table)
  }

  rs = rs || {}

  hide(self, '_data')
  hide(self, '_meta')
  hide(self, '_nestedTransactionCount')

  // take a snapshot of the data so we only save() what is changed
  self._data = JSON.parse(JSON.stringify(rs))
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
      cb(null)
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
  Object.keys(data).forEach(function(key) {
    self[key] = data[key]
  })
  self.save(cb)
}

