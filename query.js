var pg = require('pg')

module.exports = function query(opts) {

  var conString = [
    'postgres://', opts.user, ':', opts.pass, '@', opts.hosts[0], '/', opts.name
  ].join('')

  return function(sql, values,  cb) {

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

    pg.connect(conString, function(err, client, done) {
      if (err) {
        cb(err)
        return console.error('error fetching client from pool', err)
      }

      if (opts.debug) {
        console.log(sql)
      }

      client.query({
        text: sql
        //values: values
      }, function(err, result) {
        //call `done()` to release the client back to the pool
        done()

        if (err) {
          console.log(sql);
          console.error('error running query', err)
          return cb(err)
        }

        //console.log('sql:', sql);
        // console.log('rows:', result.rows);

        cb(null, result.rows)
      })
    })
  }
}



// based on https://github.com/felixge/node-mysql#custom-format
// TODO: replace sequentially with $1, $2, etc instead of actual values
// (sql injection prevention)
var queryValues = function (query, values) {
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