var pg = require('pg')
var async = require('async')
var query
var hide = require('hide-property')
var Row = require('./row')

var memo = {} // memoized query results


var Table = module.exports = function Table(tableName, db, cb) {
  var self = this
  if (!(self instanceof Table)) {
    return new Table(tableName, db, cb)
  }

  self.name = tableName
  self.fk = {}
  self.db = db

  self._methods = {}

  hide(self, 'db')
  hide(self, '_methods')

  query = db.execute

  async.parallel([
    self.getColumns.bind(self),
    self.getForeignKeys.bind(self),
    self.getPrimaryKeyDefinition.bind(self)
  ],
  function(err) {
    cb(err)
  });

}


Table.prototype.insert = function(data, cb) {
  this.save(data, cb)
}


/**
 * Find many records
 * @param  {Object}   params
 */
Table.prototype.find = function(params, cb) {
  var self = this
  var iq = self.db._platform.identifierQuoteChar
  params = params || {}
  var sql = [
    'SELECT ' + iq + self.primaryKey.join(iq + ', ' + iq) + iq,
    'FROM ' + iq + self.name + iq,
    'WHERE true'
  ];
  var values = {}

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
        sql.push('AND ' + property + " = :" + property)
        values[property] = params.where[property]
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
  sql = sql.join('\n')
  var self = this;
  query(sql, values, function(err, rs) {
    if (err) return cb(err)
    var objects = []
    async.eachSeries(rs, function(r, done) {
      self.get(r, function(err, obj) {
        objects.push(obj)
        done(err)
      })
    }, function(err) {
      return cb(err, objects)
    })
  })
}


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
  var self = this
  self.db._platform.getColumns(self.name, function(err, columns) {
    if (err) return cb(err)
    self.columns = columns
    cb(null)
  })
}


/**
 *
 */
Table.prototype.getPrimaryKeyDefinition = function(cb) {
  var self = this
  self.db._platform.getPrimaryKeyDefinition(self.name, function(err, pk) {
    if (err) return cb(err)
    self.primaryKey = pk
    cb(null)
  })
}


/**
 *
 */
Table.prototype.getForeignKeys = function(cb) {
  var self = this
  cb = cb || function(){}
  self.db._platform.getForeignKeys(self.name, function(err, foreignKeys) {
    if (err) return cb(err)
    self.fk = foreignKeys
    cb(null)
  })
}


Table.prototype.get = function(key, cb) {
  var self = table = this
  var pkWhere = self.getPrimaryKeyWhereClause(key)
  var iq = self.db._platform.identifierQuoteChar
  var sql = [
    'SELECT *',
    'FROM ' + iq + self.name + iq,
    'WHERE ' + pkWhere
  ]
  var memoMs = self.db._opts.memoize
  var cacheKey = self.getCacheKey(key)

  // memoize so we're never running duplicate queries
  if (memoMs) {
    if (memo[cacheKey] && memo[cacheKey].timestamp + memoMs > Date.now()) {
      // if this query is already in progress don't run it again
      var interval = setInterval(function() {
        if (!memo[cacheKey].queryInProgress) {
          clearInterval(interval)
          cb(null, self.instantiateRow(memo[cacheKey].data))
        }
      }, 1)
      return
    }
    memo[cacheKey] = {
      queryInProgress: true
    }
  }

  if (!self.db._opts.cache || typeof self.db._opts.cache.get !== 'function') {
    return getFromDb()
  }

  // try to get from cache
  self.db._opts.cache.get(cacheKey, function(err, json) {
    if (err) return cb(err)
    if (json) {
      var val = JSON.parse(json)
      if (val) {
        return cb(null, self.instantiateRow(val))
      }
    }
    getFromDb()
  })

  function getFromDb() {
    query(sql, function(err, rs) {
      if (err) return cb(err)
      // memoize readOnly queries
      if (memoMs) {
        memo[cacheKey] = {
          timestamp: Date.now(),
          data: rs[0]
        }
      }
      if (!rs[0]) {
        var error = new Error('Row not found.')
        error.notFound = true
        return cb(error)
      }
      var row = self.instantiateRow(rs[0])
      cb(null, row)
    })
  }
}


Table.prototype.instantiateRow = function(data) {
  return new Row(data, this)
}


Table.prototype.mget = function(keys, cb) {
  var self = this
  var i = 0
  var data = []
  async.eachSeries(keys, function(key, done) {
    self.get(key, function(err, obj) {
      data.push(obj)
      done(err)
    })
  }, function(err) {
    cb(err, data)
  })
}


/**
 * @param array|object|int|string key the primary key.
 */
Table.prototype.getPrimaryKeyWhereClause = function(key) {
  //console.log('getPrimaryKeyWhereClause')
  var self = this
  var iq = self.db._platform.identifierQuoteChar
  var criteria = ''
  if (!isArray(key) && !isObject(key)) {
    var temp = key
    key = []
    key[0] = temp
  }
  self.primaryKey.forEach(function(field, i) {
    var val = key[field]
    if (isArray(key)) {
      val = key[i]
    }
    if (criteria.length > 0) {
      criteria += ' AND '
    }
    if (!val) {
      throw new Error('Invalid value specfied for "' + self.name + '" composite primary key.')
    }
    criteria += iq + self.name + iq + '.' + iq + field + iq + " = '" + val + "'"
  })
  //console.log('criteria:', criteria)
  return criteria;
}


Table.prototype.getCacheKey = function(key) {
  var self = this
  var cacheKey = ''
  if (isObject(key)) {
    Object.keys(key).forEach(function(prop) {
      if (cacheKey) {
        cacheKey = cacheKey + ','
      }
      cacheKey = cacheKey + key[prop]
    })
  } else if (isArray(key)) {
    key.forEach(function(val) {
      if (cacheKey) {
        cacheKey = cacheKey + ','
      }
      cacheKey = cacheKey + val
    })
  } else {
    cacheKey = key
  }
  cacheKey = self.name + ':' + cacheKey
  return cacheKey
}


Table.prototype.invalidateMemo = function(key) {
  var self = this
  var cacheKey = self.getCacheKey(key)
  delete memo[cacheKey]
}


Table.prototype.save = function(data, cb) {
  var row = new Row(data, this)
  row._save(cb)
}



function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isString(obj) {
  return toString.call(obj) === '[object String]'
}

function isObject(obj) {
  return toString.call(obj) === '[object Object]'
}

// https://github.com/paulmillr/es6-shim
// ES6 isInteger Polyfill https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger#Polyfill
var isInteger = Number.isInteger || function(val) {
  return typeof val === "number" &&
    ! Number.isNaN(val) &&
    Number.isFinite(val) &&
    val > -9007199254740992 &&
    val < 9007199254740992 &&
    parseInt(val, 10) === val;
}