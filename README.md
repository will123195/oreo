[![Oreo](oreo.png)](https://github.com/will123195/oreo)


[![Build Status](https://travis-ci.org/will123195/oreo.svg?branch=master)](https://travis-ci.org/will123195/oreo)

# Features

- Simple syntax for reading/writing to db
- Detects relationships (primary and foreign keys)
- Saves nested objects in a single transaction
- Has just 1 dependency (async)
- Detects master/slave hosts
- Use callbacks or plug in your own Promise library
- Optional row memoization and row caching

# Database Support

- PostgreSQL 9+
- MySQL

# Installation

```bash
npm install oreo
npm install pg
#npm install mysql
```

# Quick Example

```js
var oreo = require('oreo')

var db = oreo({
  driver: 'mysql',
  hosts: ['localhost'],
  name: 'my_db',
  user: 'root',
  pass: ''
}, function (err) {
  // Assuming you have a table "artists"
  // Get an artist by primary key
  db.artists.get(id, function (err, artist) {
    console.log(artist)
  })
}
```

<hr />

# Documentation

## Usage

* [`oreo`](#instantiate)

## Db

* [`execute`](#execute)
* [`executeWrite`](#executeWrite)
* [`onReady`](#onReady)
* [`end`](#end)

## Table

* [`find`](#find)
* [`findOne`](#findOne)
* [`get`](#get)
* [`insert`](#insert)
* [`mget`](#mget)
* [`save`](#table_save)

## Row

* [`hydrate`](#hydrate)
* [`save`](#save)
* [`set`](#set)
* [`update`](#update)

<hr />

# Full Example

&dagger; see the example database schema below

```js
var oreo = require('oreo')

// initialize oreo: auto-detects the schema and determines writable/read-only hosts
var db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'my_db',
  user: 'username',
  pass: 'password',
  debug: console.log,
  memoize: 150, // optional duration in ms to memoize rows
  cache: redisClient, // optional
  Promise: Promise // optional
}, runExampleQueries)

function runExampleQueries(err) {

  // register a method to bind to all `Row` instances of `books`
  db.books._methods.getTitle = function () {
    return this.title
  }

  // get one book (by primary key)
  db.books.get(1, function (err, book) {
    // book.title
    // book.getTitle() -- see above we registered this method
  })

  // Insert a new book and its author
  db.books.insert({
    title: 'Fear and Loathing in Las Vegas',
    author: {
      name: 'Hunter S.Thompson'
    }
  }, function (err, book) {
    console.log(book) // { id: 1, title: Fear and Loathing in Las Vegas, author_id: 1 }

    // Get a linked object
    book.hydrate('author', function (err, author) {
      console.log(book.author) // { id: 1, name: Hunter S. Thompson, books: [] }

      // Get multiple books using array of primary keys
      db.books.mget(author.books, function (err, books) {
        console.log(books)
      })
    })

    // Find authors by criteria
    db.authors.find({
      where: {
        author_id: 1
      }
    }, function (err, authors) {
      console.log(authors) // [{ id: 1, name: Hunter S. Thompson, books: [] }]
    })

    // Update the book
    book.update({
      title: 'The Rum Diary'
    }, function (err, book) {
      console.log(book) // { id: 1, title: The Rum Diary, author_id: 1 }
    })
  })
}
```

Example database schema:
```sql
CREATE TABLE authors (
  id SERIAL,
  name VARCHAR,
  books INTEGER[],
  CONSTRAINT author_pkey PRIMARY KEY(id)
);

CREATE TABLE books (
  id SERIAL,
  title VARCHAR,
  author_id INTEGER,
  CONSTRAINT book_pkey PRIMARY KEY(id),
  CONSTRAINT author FOREIGN KEY (author_id) REFERENCES authors(id)
);
```
**Pro Tip:** [Create a trigger](https://github.com/will123195/oreo/wiki/Trigger-to-populate-array) to auto-populate `author.books[]`.

**Hacker Tip:** [Replicate to Redis](https://github.com/will123195/oreo/wiki/Replicate-to-Redis) so your cache is never stale.

<hr />

# Usage

<a name="instantiate" />
## oreo( opts, [cb] )

Instantiates the `db` object and configures the database connection string(s).

- **opts** {Object} options
    - driver: `pg` or `mysql`
    - hosts: array of possible hosts, each is checked to see if it is online and writable or read-only
    - name: the database name
    - user: the username
    - password: the password
    - debug: (optional, default `false`) set to `console.log` to see info about running queries
    - memoize: (optional, default `false`) duration in milliseconds to cache rows in process memory. I like setting this to 150ms to prevent fetching a row multiple times simultaneously.
    - cache: (optional, default `false`) object with `get(key)` and/or `set(key, val)` methods (i.e. redis) to cache full rows (indefinitely). Cached rows are recached after `save()`/`insert()`/`update()`/`delete()`. The [Table functions](#table) fetch rows from the cache (and only fetch from sql the rows that are not cached).
    - Promise: (optional, default `global.Promise`) You may plug in your own Promise library that is compatible with native promises, i.e. `Promise: require('bluebird')`. Then a promise will be returned if a callback is not specified.
- **cb** {Function} *(optional)* callback(err)

```js
var oreo = require('oreo')
var db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'database',
  user: 'username',
  pass: 'password',
  //debug: false, //console.log
  //memoize: 0,
  //cache: null,
  //Promise: global.Promise
}, function (err) {
  db.execute('select now() as now', function (err, rs) {
    console.log('now:', rs[0].now)
  })
})
```

If no callback is provided a Promise is returned.

# Db

<a name="execute" />
## db.execute( sql, [data], [options], [cb] )

Executes an arbitrary SQL query.
- **sql** {String|Array} the SQL statement
- **data** {Object} *(optional, unless `options` is specified)* parameterized query data
- **options** {Object} *(optional)* query options
    - `write` *(optional)* if truthy, forces query to run on master db, otherwise attempts to run on a read-only host
    - `conString` *(optional)* the connection string of the db
- **cb** {Function} *(optional)* callback(err, results)

```js
db.execute([
  'select now()', // arrays can be used for multi-line convenience
  'as now'
], function (err, rs) {
  console.log(rs[0]) // 2014-06-24 21:03:08.652861-04
})
```

Parameterized query (SQL injection safe):
```js
db.execute(`
  select id
  from authors
  where name = :name
`, {
  name: 'Jack Kerouac',
}, function (err, rows) {
  console.log(rows[0].id) // 1
})
```

If no callback is provided a Promise is returned:
```js
db.execute('select now()')
  .then(function (rows) {

  })
  .catch(function (err) {

  })
```

<a name="executeWrite" />
## db.executeWrite( sql, [data], [options], [cb] )

Same as `execute()` but executes the query on a writable (master) host.

<a name="onReady" />
## db.onReady( fn )

Queues a function to be called when oreo's schema detection is complete (i.e. when oreo is initialized).

```js
var db = oreo(config, function (err) {
  if (err) return console.log(err)
  console.log('Ready!')
})
db.onReady(function () {
  console.log('onReady #1')
})
db.onReady(function () {
  console.log('onReady #2')
})
```
Output:
```
onReady #1
onReady #2
Ready!
```

<a name="end" />
## db.end()

Close the db connection(s).

# Table

<a name="find" />
## db.***table***.find( opts, [cb] )

Finds one or more rows:
```js
db.authors.find({
  where: ["name ilike 'Jack%'"],
  order: 'name asc',
  offset: 5,
  limit: 5
}, function (err, authors) {
  console.log(authors[0].id) // 1
})
```

The `where` option has several valid formats:
- {String}

    ```js
    where: "field = 'abc' and field2 > 1"
    ```
- {Array}

    ```js
    where: ["field = 'abc'", "field2 > 1"]
    ```
- {Object} recommended, blocks SQL injection

    ```js
    where: {
      field: 'abc',
      field2: {'>': 1}
    }
    ```

If no callback is provided a Promise is returned.

<a name="findOne" />
## db.***table***.findOne( opts, [cb] )

Finds exactly one row:
```js
db.authors.findOne({
  where: ["name ilike 'Jack%'"],
  order: 'name asc',
  offset: 5
}, function (err, author) {
  console.log(author.id) // 1
})
```

If no callback is provided a Promise is returned.

<a name="get" />
## db.***table***.get( primaryKey, [cb] )

Finds a row by primary key:
```js
db.authors.get(1, function (err, author) {
  console.log(author) // { id: 1, name: Jack Kerouak, books: [1] }
})
```

Multi-column (composite) primary key:
```js
db.parts.get({
  company: 'Cogswell Cogs',
  part_no: 'A-12345'
}, function (err, part) {

})
```

If no callback is provided a Promise is returned.

<a name="insert" />
## db.***table***.insert( data, [cb] )

Inserts a new row.
```js
db.books.insert({
  title: 'On the Road',
  author_id: 1
}, function (err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
})
```

Insert multiple rows into related tables in a single transaction:
```js
db.books.insert({
  title: 'On the Road',
  author: {
    name: 'Jack Kerouac'
  }
}, function (err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.hydrate(function (err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1, author: { id: 1, name: Jack Kerouac, books: [1] } }
  })
})
```

If no callback is provided a Promise is returned.

<a name="mget" />
## db.***table***.mget( primaryKeys, [cb] )

Gets many rows from the database by primary key:
```js
var bookIds = [1]
db.books.mget(bookIds, function (err, books) {
  console.log(books)
  // [ { id: 1, title: On the Road, author_id: 1 } ]
})
```

If no callback is provided a Promise is returned.

<a name="table_save" />
## db.***table***.save( data, [cb] )

Inserts or updates depending on whether the primary key exists in the db.
```js
var formPOST = {
  id: 1,
  title: 'New Title'
}
db.books.save(formPOST, function (err, book) {
  console.log(book)
  // { id: 1, title: New Title, author_id: 1 }
})
```

If no callback is provided a Promise is returned.

# Row

<a name="hydrate" />
## row.hydrate( fkConstraintName, [cb] )

Gets the linked record (foreign key)
```js
db.books.get(1, function (err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.hydrate('author', function (err) {
    console.log(book)
    // {
    //   id: 1,
    //   title: On the Road,
    //   author_id: 1,
    //   author: { id: 1, name: Jack Kerouac, books: [1] }
    // }
  })
})
```

If no callback is provided a Promise is returned.

<a name="save" />
## row.save( [cb] )

Saves the modified property values to the database (recursively):
```js
db.books.get(1, function (err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.author_id = 2
  book.save(function (err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 2 }
  })
})
```

If no callback is provided a Promise is returned.

<a name="set" />
## row.set( data )

Sets multiple property values but does not save yet:
```js
db.books.get(1, function (err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.set({
    title: 'New Title',
    author_id: 2
  })
  book.save()
})
```

<a name="update" />
## row.update( data, [cb] )

Update an existing row:
```js
book.update({
  title: 'New Title'
}, function (err, book) {
  console.log(book)
  // { id: 1, title: New Title, author_id: 1 }
})
```

If no callback is provided a Promise is returned.

## Known Issues

- Tables containing `JSON` data type are not supported (use `JSONB` instead!)
