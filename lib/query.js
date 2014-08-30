var pg = require('pg')
var async = require('async')

var Query = module.exports = function Query(opts, cb) {

  var self = this
  if (!(self instanceof Query)) {
    return new Query(opts, cb)
  }

  self.opts = opts
  self.writable = []
  self.readOnly = []

  if (typeof cb !== 'function') cb = function() {}

  self.detectTopology(cb)

  return function() {
    return self.execute.apply(self, arguments)
  }
}


Query.prototype.execute = function(sql, values, options, cb) {
  var self = this

  if (typeof options === 'function') {
    cb = options
    options = undefined
  }

  if (typeof sql !== 'string' && !isArray(sql)) {
    return cb(new Error('sql must be string or array multiline string'))
  }

  if (typeof values === 'function') {
    cb = values
    values = undefined
  }

  if (isArray(sql)) {
    sql = sql.join('\n')
  }

  if (values) {
    sql = queryValues(sql, values)
  }

  options = options || {}

  var conString = ''

  if (options.conString) {
    conString = options.conString
  } else if (options.write) {
    conString = self.writable[randomInt(0, self.writable.length - 1)]
  } else {
    conString = self.readOnly[randomInt(0, self.readOnly.length - 1)]
  }

  // memoize read queries
  if (!options.write && self.opts.memoize) {
    //if ()
  }

  pg.connect(conString, function(err, client, done) {
    if (err) {
      cb(err)
      return console.error('pg.connect(' + conString + ')', err)
    }

    var start = Date.now()

    client.query({
      text: sql
      //values: values
    }, function(err, result) {
      //call `done()` to release the client back to the pool
      done()

      if (err) {
        if (!self.opts.silent) {
          console.error('\n' + sql + '\nSQL ERROR:', err)
        }
        return cb(err)
      }

      if (self.opts.debug) {
        console.log('\n' + sql + '\n' + (Date.now() - start) + 'ms')
      }

      cb(null, result.rows)
    })
  })
}


Query.prototype.detectTopology = function(cb) {
  var self = this
  var opts = self.opts
  // Connect to all seed hosts and determine read/write servers
  async.eachSeries(opts.hosts, function(host, callback) {
    var sql
    var conString = 'postgres://'+opts.user+':'+opts.pass+'@'+host+'/'+opts.name

    sql = 'select pg_is_in_recovery() as is_slave'
    self.execute(sql, null, {
      conString: conString
    }, function(err, rs) {
      if (err) {
        // try next host
        return callback(null)
      }
      if (rs[0].is_slave) {
        self.readOnly.push(conString)
      } else {
        self.writable.push(conString)
      }
      callback(null)
    })

  }, function() {
    if (self.readOnly.length === 0 && self.writable.length === 0) {
      return cb(new Error('Unable to connect to database.'))
    }
    if (self.readOnly.length === 0) {
      self.readOnly = self.writable
    }
    cb(null)  
  })
}


// based on https://github.com/felixge/node-mysql#custom-format
// TODO: make sure you can't sqli with ';'
function queryValues(query, values) {
  if (!values) return query;
  return query.replace(/\:(\w+)/g, function (txt, key) {
    if (values.hasOwnProperty(key)) {
      if (typeof values[key] !== 'string') {
        return values[key];
      }
      return "'" + values[key].replace(/'/g, "''") + "'";
    }
    return txt;
  });
};


function isArray(value) {
  return (Object.prototype.toString.call(value) === '[object Array]')
}


function randomInt(min, max) {
    return Math.floor(Math.random()*(max-min+1)+min);
}

