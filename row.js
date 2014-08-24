var async = require('async')

var Row = module.exports = function Row(rs, table) {
  var self = this
  if (!(self instanceof Row)) {
    return new Row(rs, table)
  }

  Object.defineProperty(self, '_meta', {
      enumerable: false,
      writable: true
  })
  Object.defineProperty(self, '_data', {
      enumerable: false,
      writable: true
  })
  self._meta = table
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

Row.prototype.save = function(cb) {
  var self = this
  var update = {}
  Object.keys(self._data).forEach(function(field) {
    if (self[field] !== self._data[field]) {
      update[field] = self[field]
    }
  })
  self.update(update, cb)
}

// TODO: ability to hydrate using composite primary key
Row.prototype.hydrate = function(cb) {
  var self = this
  if (self._meta.fk) {
    async.eachSeries(self._meta.fk, function(fk, done) {
      var property = fk.constraint_name
      var fkTable = fk.foreign_table_name
      var sql = [
        'SELECT "' + table.primaryKey.join('", "') + '"',
        'FROM "' + fkTable + '"',
        'WHERE "' + fk.foreign_column_name + '" = \'' + self[fk.column_name] + '\''
      ]
      self._meta.orm.execute(sql, function(err, rs) {
        if (rs[0]) {
          table.orm[fkTable].get(rs[0], function(err, obj) {
            self[property] = obj
            done(err)
          })
        }
      })
    }, function(err) {
      cb(err, self)
    })
  }
}


Row.prototype.getPrimaryKey = function() {
  var self = this
  var pk = []
  table.primaryKey.forEach(function(field) {
    pk.push(self[field])
  })
  return pk
}


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
    //'WHERE "' + this._meta.name + '".id = ' + this.id,
    'WHERE ' + pkWhere,
    'RETURNING *'
  ].join('\n');
  self._meta.orm.execute(sql, data, function(err, rs) {
    return cb(err, rs ? rs[0] : null)
  })
}

