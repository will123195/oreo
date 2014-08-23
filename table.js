var pg = require('pg')
var async = require('async')
var query
var isInteger = require('is-integer')
var Row = require('./row')
//var wrap = require('thunkify-wrap')
// var EventEmitter = require('events').EventEmitter
// var util = require('util')


var Table = module.exports = function Table(tableName, q, cb) {
  var self = this
  if (!(self instanceof Table)) {
    return new Table(tableName, q, cb)
  }

  self.name = tableName

  self._methods = {}
  Object.defineProperty(self, '_methods', {
    enumerable: false,
    writable: true
  })

  query = q

  async.parallel([
    self.getColumns.bind(self),
    self.getForeignKeys.bind(self),
    self.getPrimaryKeyDefinition.bind(self)
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
  var self = this
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
    cb(null)
  })
}


/**
 *
 */
Table.prototype.getPrimaryKeyDefinition = function(cb) {
  var self = this
  var sql = "\
    SELECT \
      c.relname, \
      pg_catalog.pg_get_constraintdef(con.oid, true) as def, \
      con.conname, \
      con.conkey \
    FROM \
      pg_catalog.pg_class c, \
      pg_catalog.pg_index i \
    LEFT JOIN pg_catalog.pg_constraint con ON (conrelid = i.indrelid AND conindid = i.indexrelid) \
    WHERE c.oid = i.indrelid \
    AND con.contype = 'p' \
    AND c.relname = '" + this.name + "' \
    ORDER BY i.indisprimary DESC, i.indisunique DESC \
  "
  query(sql, function(err, rs) {
    if (err) return cb(err)
    var regExp = /\(([^)]+)\)/;
    var matches = regExp.exec(rs[0].def);
    var pk = matches[1].split(', ')
    self.primaryKey = pk
    cb(null)
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
    cb(null)
  })
}


Table.prototype.get = function(key, cb) {
  var self = table = this
  var pkWhere = self.getPrimaryKeyWhereClause(key)
  var sql = "\
    SELECT *\
    FROM \"" + self.name + "\" \
    WHERE " + pkWhere + " \
  "
  query(sql, function(err, rs) {
    if (err) return cb(err)

    var row = new Row(rs[0], table)

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


/**
 * @param array|int|string key the primary key. use array for composite primary key
 */
Table.prototype.getPrimaryKeyWhereClause = function(key) {
  var self = this
  var criteria = ''
  if (self.primaryKey.length > 1) {
    if (!isArray(key)) {
      throw new Error('"' + self.name + '" has a composite primary key so an array is required.')
    }
    self.primaryKey.forEach(function(field, i) {
      if (criteria.length > 0) {
        criteria += ' AND '
      }
      criteria += '"' + self.name + '"."' + field + '"' + " = '" + key[i] + "'"
    })
  } else {
    if (isArray(key)) {
      key = key[0]
    }
    criteria = '"' + self.name + '"."' + self.primaryKey[0] + '"' + " = '" + key + "'"
  }
  return criteria;
}


//util.inherits(Table, EventEmitter)




function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]'
}

function isString(obj) {
  return toString.call(obj) === '[object String]'
}

