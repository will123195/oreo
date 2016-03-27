var async = require('./async')
var hide = require('./hideProperty')
var Row = require('./row')
var extend = require('./extend')

//
// opts.tableName
// opts.db
// opts.fromCache
//
var Table = module.exports = function Table(opts, cb) {
  var self = this
  if (!(self instanceof Table)) {
    return new Table(opts, cb)
  }

  var tableName = opts.tableName

  self.name = tableName
  self.fk = {}
  self.db = opts.db

  hide(self, 'db')

  var models = self.db._opts.models
  if (models && models[tableName] && typeof models[tableName] === 'function') {
    var model = models[tableName]
    self.Row = model
  }

  if (opts.fromCache) {
    self.columns = []
    self.fk = {}
    self.primaryKey = []
    extend(self, self.db._opts.schema[tableName])
    process.nextTick(cb)
    return
  }

  async.each([
    self.getColumns.bind(self),
    self.getForeignKeys.bind(self),
    self.getPrimaryKeyDefinition.bind(self)
  ], function (fn, done) {
    fn(done)
  }, cb)
}


Table.prototype.insert = function(data, cb) {
  return this.save(data, cb)
}


/**
 * Find many records
 * @param  {Object}   opts
 */
Table.prototype.find = function(opts, cb) {
  var self = this
  var iq = self.db._platform.identifierQuoteChar
  opts = opts || {}
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }

  cb = cb || self.db._promiseResolver()

  var sql = [
    'SELECT ' + iq + self.primaryKey.join(iq + ', ' + iq) + iq,
    'FROM ' + iq + self.name + iq,
    'WHERE true'
  ];
  var values = opts.params || {}

  if (opts) {

    // where
    if (isArray(opts.where)) {
      opts.where.forEach(function(val, i) {
        if (isString(val)) {
          sql.push('AND ' + val)
        }
      });
    } else if (isString(opts.where)) {
      sql.push('AND ' + opts.where)
    } else if (opts.where) {
      Object.keys(opts.where).forEach(function(property) {
        if (typeof opts.where[property] === 'undefined') {
          return
        }
        sql.push('AND ' + property + " = :" + property)
        values[property] = opts.where[property]
      })
    }

    // order
    if (opts.order) {
      var orderBy = ''
      if (isString(opts.order)) {
        orderBy = opts.order
      } else if (isArray(opts.order)) {
        opts.order = opts.order.join(', ')
      }
      if (opts.order) {
        sql.push('ORDER BY ' + opts.order)
      }
    }

    // limit
    if (opts.limit) {
      sql.push('LIMIT ' + opts.limit)
    }

    // offset
    if (isInteger(opts.offset)) {
      sql.push('OFFSET ' + opts.offset)
    }

  }
  sql = sql.join('\n')
  self.db.execute(sql, values, function(err, rs) {
    if (err) return cb(err)
    self.mget(rs, function(err, rows) {
      if (err) return cb(err)
      if (!opts.hydrate) {
        return cb(null, rows)
      }
      // TODO: we can optimize multiple hydrations by using mget
      async.each(rows, function (row, done) {
        row.hydrate(opts.hydrate, done)
      }, function (err) {
        return cb(err, rows)
      })
    })
  })

  return cb.promise ? cb.promise : this
}


/**
 * Find one record
 * @param  {Object}   params
 */
Table.prototype.findOne = function(params, cb) {
  params.limit = 1;
  cb = cb || this.db._promiseResolver()
  this.find(params, function(err, rs) {
    if (err) return cb(err)
    cb(null, rs[0])
  })
  return cb.promise ? cb.promise : this
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

/**
 * Get a row by primary key
 * get(key)
 * get(key, cb)
 * get(key, params)
 * get(key, params, cb)
 *
 * @param  {string|object}   key
 * @param  {object}          params
 *                           params.cacheOnly {boolean}
 *                           params.hydrate   {string|array}
 * @param  {Function}        cb
 */
Table.prototype.get = function(key, params, cb) {
  params = params || {}
  if (typeof params === 'function') {
    cb = params
    params = {}
  }
  var self = table = this
  cb = cb || self.db._promiseResolver()
  var pkWhere = self.getPrimaryKeyWhereClause(key)
  var iq = self.db._platform.identifierQuoteChar
  var sql = [
    'SELECT *',
    'FROM ' + iq + self.name + iq,
    'WHERE ' + pkWhere
  ]
  var memoMs = self.db._opts.memoize
  var cacheKey = self.getCacheKey(key)
  var memo = self.db._memo

  // memoize so we're never running duplicate queries
  if (memoMs) {
    if (memo[cacheKey] && memo[cacheKey].timestamp + memoMs > Date.now()) {
      // if this query is already in progress don't run it again
      var interval = setInterval(function() {
        if (!memo[cacheKey].queryInProgress) {
          clearInterval(interval)
          return instantiate(memo[cacheKey].data)
        }
      }, 1)
      return cb.promise ? cb.promise : self
    }
    memo[cacheKey] = {
      queryInProgress: true
    }
  }

  var noCache = !self.db._opts.cache || typeof self.db._opts.cache.get !== 'function'
  if (noCache) {
    getFromDb()
    return cb.promise ? cb.promise : self
  }

  // try to get from cache
  var start = Date.now()
  self.db._opts.cache.get(cacheKey, function(err, json) {
    if (err) return cb(err)
    if (json) {
      var val
      try {
        val = JSON.parse(json)
      } catch (e) {}

      if (val) {
        if (self.db._opts.debug) {
          self.db._opts.debug(
            '\n' + 'cache.get(' + cacheKey + ')\n' +
            (Date.now() - start) + 'ms'
          )
        }
        return instantiate(val)
      }
    }
    getFromDb()
  })
  return cb.promise ? cb.promise : self

  function instantiate(val) {
    var row = self.instantiateRow(val)
    if (!params.hydrate) {
      return cb(null, row)
    }
    row.hydrate(params.hydrate, function (err) {
      if (err) return cb(err)
      return cb(null, row)
    })
  }

  function getFromDb() {
    if (params.cacheOnly) {
      return cb(null, null)
    }
    self.db.execute(sql, function(err, rs) {
      if (err) return cb(err)
      var r = rs[0]
      // memoize readOnly queries
      if (memoMs) {
        memo[cacheKey] = {
          timestamp: Date.now(),
          data: r
        }
      }
      if (!r) {
        var error = new Error('Row not found.')
        error.notFound = true
        return cb(error)
      }
      // save to cache
      if (self.db._opts.cache && typeof self.db._opts.cache.set === 'function') {
        self.db._opts.cache.set(cacheKey, JSON.stringify(r), function(err) {
          if (err) console.error(err)
        })
      }
      instantiate(r)
    })
  }
}


Table.prototype.instantiateRow = function(data) {
  var row = Row(data, this)
  row._data = data
  return row
}


Table.prototype.mget = function(keys, cb) {
  var self = this
  var rows = []
  var cacheKeys = []
  var iq = self.db._platform.identifierQuoteChar
  cb = cb || self.db._promiseResolver()
  async.forEachOf(keys, function(key, i, done) {
    cacheKeys[i] = self.getCacheKey(key)
    self.get(key, { cacheOnly: true }, function(err, obj) {
      rows[i] = obj
      done(err)
    })
  }, function(err) {
    if (err) return cb(err)
    // now get anything uncached from the db
    var haveAllRows = true
    var where = []
    rows.forEach(function (row, i) {
      if (row) return
      haveAllRows = false
      var pkWhere = self.getPrimaryKeyWhereClause(keys[i])
      where.push('(' + pkWhere + ')')
    })
    if (haveAllRows) {
      return cb(null, rows)
    }
    var sql = [
      'SELECT *',
      'FROM ' + iq + self.name + iq,
      'WHERE (' + where.join(' OR ') + ')'
    ]
    self.db.execute(sql, function(err, rs) {
      if (err) return cb(err)
      rs.forEach(function (row) {
        var cacheKey = self.getCacheKeyFromRow(row)
        var i = cacheKeys.indexOf(cacheKey)
        rows[i] = self.instantiateRow(row)
        // save to cache
        if (self.db._opts.cache && typeof self.db._opts.cache.set === 'function') {
          self.db._opts.cache.set(cacheKey, JSON.stringify(row), function(err) {
            if (err) console.error(err)
          })
        }
      })
      cb(null, rows)
    })
  })
  return cb.promise ? cb.promise : this
}


/**
 * @param array|object|int|string key the primary key.
 */
Table.prototype.getPrimaryKeyWhereClause = function(key) {
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


Table.prototype.getCacheKeyFromRow = function(row) {
  var self = this
  var pk = {}
  self.primaryKey.forEach(function (column) {
    pk[column] = row[column]
  })
  return self.getCacheKey(pk)
}


Table.prototype.invalidateMemo = function(key) {
  var self = this
  var cacheKey = self.getCacheKey(key)
  delete self.db._memo[cacheKey]
}


Table.prototype.save = function(data, params, cb) {
  params = params || {}
  if (typeof params === 'function') {
    cb = params
    params = {}
  }
  var row = new Row(data, this)
  return row.save(params, cb)
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
