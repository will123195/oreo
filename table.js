var pg = require('pg')
var async = require('async')
var query
var isInteger = require('is-integer')
//var wrap = require('thunkify-wrap')
// var EventEmitter = require('events').EventEmitter
// var util = require('util')


var Table = module.exports = function Table(tableName, q, cb) {
  if (!(this instanceof Table)) {
    return new Table(tableName, q, cb)
  }

  var self = this

  this.name = tableName

  this._methods = {}
  Object.defineProperty(self, '_methods', {
    enumerable: false,
    writable: true
  })

  query = q

  async.parallel([
    self.getColumns.bind(self),
    self.getForeignKeys.bind(self)
  ],
  function(err) {
    cb(err)
  });

  // if (cb) {
  //   self.on('ready', cb)
  // }
}

/**
 *
 */
Table.prototype.insert = function(data, cb) {
  // remove undefined values
  data = JSON.parse(JSON.stringify(data));
  var properties = Object.keys(data);
  var sql = [
    'INSERT INTO "' + this.name + '"',
    '(' + properties.join(', ') + ')',
    'VALUES',
    '(:' + properties.join(', :') + ')',
    'RETURNING *'
  ].join('\n');
  query(sql, data, function(err, rs) {
    return cb(err, rs ? rs[0] : null)
  })
}

/**
 * Find many records
 * @param  {Object}   params
 */
Table.prototype.find = function(params, cb) {
  params = params || {};
  var sql = [
    'SELECT "' + this.name + '".id ',
    'FROM "' + this.name + '"',
    'WHERE true'
  ];

  if (params) {

    // where
    if (isArray(params.where)) {
      params.where.forEach(function(val, i) {
        if (isString(val)) {
          sql.push('AND ' + val)
        }
      });
    } else if (isString(params.where)) {
      sql.push('AND ' + params.where)
    } else if (params.where) {
      Object.keys(params.where).forEach(function(property) {
        sql.push('AND ' + property + " = '" + params.where[property] + "'")
      })
    }

    // order
    if (params.order) {
      var orderBy = ''
      if (isString(params.order)) {
        orderBy = params.order
      } else if (isArray(params.order)) {
        params.order = params.order.join(', ')
      }
      if (params.order) {
        sql.push('ORDER BY ' + params.order)
      }
    }

    // limit
    if (params.limit) {
      sql.push('LIMIT ' + params.limit)
    }

    // offset
    if (isInteger(params.offset)) {
      sql.push('OFFSET ' + params.offset)
    }

  }
  sql = sql.join('\n');
  var self = this;
  query(sql, function(err, rs) {
    var objects = [];
    async.eachSeries(rs, function(r, done) {
      self.get(r.id, function(err, obj) {
        objects.push(obj)
        done(err)
      })
    }, function(err) {
      return cb(err, objects)
    })
  });
};


/**
 * Find one record
 * @param  {Object}   params
 */
Table.prototype.findOne = function(params, cb) {
  params.limit = 1;
  this.find(params, function(err, rs) {
    cb(err, rs[0])
  })
};

/**
 * @param  {[type]} opts [description]
 */
Table.prototype.getColumns = function(cb) {
  cb = cb || function(){}
  self = this
  // get the columns
  var sql = "\
    SELECT \
      column_name, \
      data_type \
    FROM information_schema.columns \
    WHERE table_name = '" + self.name + "' \
  "
  query(sql, function(err, rs) {
    if (err) return cb(err)
    self.columns = rs
    cb()
  })
}


/**
 * [configure description]
 * @param  {[type]} opts [description]
 * @return {[type]}      [description]
 */
Table.prototype.getForeignKeys = function(cb) {
  cb = cb || function(){}
  self = this
  // get the foreign keys
  var sql = "\
    SELECT \
      tc.constraint_name, \
      tc.table_name, \
      kcu.column_name, \
      ccu.table_name AS foreign_table_name, \
      ccu.column_name AS foreign_column_name \
    FROM information_schema.table_constraints AS tc \
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name \
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name \
    WHERE constraint_type = 'FOREIGN KEY' \
    AND tc.table_name = '" + this.name + "' \
  "
  query(sql, function(err, rs) {
    if (err) return cb(err)
    self.fk = rs
    cb()
  })
}


Table.prototype.get = function(id, cb) {
  var self = this
  var table = this
  var sql = "\
    SELECT *\
    FROM \"" + this.name + "\" \
    WHERE id = " + id + " \
  "
  query(sql, function(err, rs) {
    if (err) return cb(err)
    var row = rs[0]
    Object.defineProperty(row, '_meta', {
        enumerable: false,
        writable: true
    })
    Object.defineProperty(row, '_data', {
        enumerable: false,
        writable: true
    })
    row._meta = self
    row._data = JSON.parse(JSON.stringify(row))
    if (self.construct && typeof self.construct === 'function') {
      self.construct.call(row)
    }

    // bind user defined row methods to this row instance
    Object.keys(table._methods).forEach(function(method) {
      row[method] = table._methods[method].bind(row)
    })

    row.dump = function() {
      console.log(this._meta.name + ':', this);
    }

    row.set = function(data) {
      var self = this
      Object.keys(data).forEach(function(field) {
        self._data[field] = self[field]
        self[field] = data[field]
      })
    }

    row.save = function(cb) {
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
    row.hydrate = function(cb) {
      var self = this
      if (self._meta.fk) {
        async.eachSeries(self._meta.fk, function(fk, done) {
          var property = fk.constraint_name
          var fkTable = fk.foreign_table_name
          var sql = "\
            select id \
            from \"" + fkTable + "\" \
            where " + fk.foreign_column_name + " = " + self[fk.column_name] + " \
          "
          query(sql, function(err, rs) {
            if (rs[0]) {
              table.orm[fkTable].get(rs[0].id, function(err, obj) {
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

    row.update = function(data, cb) {
      // remove undefined values
      data = JSON.parse(JSON.stringify(data))
      var set = []
      Object.keys(data).forEach(function(field) {
        set.push(field + ' = :' + field)
      })
      var sql = [
        'UPDATE "' + this._meta.name + '"',
        'SET ' + set.join(',\n'),
        'WHERE "' + this._meta.name + '".id = ' + this.id,
        'RETURNING *'
      ].join('\n');
      query(sql, data, function(err, rs) {
        return cb(err, rs ? rs[0] : null)
      })
    }

    //row = wrap(row)

    cb(null, row)
  })
}


Table.prototype.hydrateArray = function(keys, cb) {
  var self = this
  var i = 0
  async.eachSeries(keys, function(key, done) {
    self.get(key, function(err, obj) {
      keys[i] = obj
      i++
      done(err)
    })
  }, function(err) {
    cb(err, keys)
  })
}


//util.inherits(Table, EventEmitter)




function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isString(obj) {
  return toString.call(obj) === '[object String]'
}

