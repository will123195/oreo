[![Oreo](oreo.png)](https://github.com/will123195/oreo)


[![Build Status](https://travis-ci.org/will123195/oreo.svg?branch=master)](https://travis-ci.org/will123195/oreo)

# Features

- Simple syntax for CRUD operations
- Detects relationships (primary keys and foreign keys)
- Read/write multi-table nested objects in a single transaction
- Detects primary/read-only hosts
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
}).then(runExampleQueries)

function runExampleQueries () {

  // get one book (by primary key)
  db.books.get(1).then(function (book) {
    // book.title
  })

  // Insert a new book, its author and some reviews (in a single transaction)
  db.books.insert({
    title: 'Fear and Loathing in Las Vegas',
    author: {
      name: 'Hunter S.Thompson'
    },
    reviews: [ // shorthand for 'book:reviews'
      { stars: 5, body: 'Psychadelic!'},
      { stars: 4, body: 'Bizarre, unpredictable yet strangely alluring.'},
    ]
  }).then(function (book) {
    console.log(book) // { id: 1, title: Fear and Loathing in Las Vegas, author_id: 1 }

    // Get a linked object
    book.hydrate('author').then(function () {
      console.log(book.author) // { id: 1, name: Hunter S. Thompson, books: [] }
    })

    // Get 1-to-many linked objects
    book.hydrate('reviews').then(function () {
      console.log(book.reviews) // array of Review rows
    })

    // Find authors by criteria
    db.authors.find({
      where: {
        name: 'Hunter S. Thompson'
      }
    }).then(function (authors) {
      console.log(authors) // [{ id: 1, name: Hunter S. Thompson, books: [] }]
    })

    // Update the book
    book.update({
      title: 'The Rum Diary'
    }).then(function (book) {
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

CREATE TABLE reviews (
  id SERIAL,
  book_id INTEGER,
  stars INTEGER,
  body VARCHAR,
  CONSTRAINT review_pkey PRIMARY KEY(id),
  CONSTRAINT book FOREIGN KEY (book_id) REFERENCES book(id)
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
    - **driver** `pg` or `mysql`
    - **hosts** array of possible hosts, each is checked to see if it is online and writable or read-only
    - **name** the database name
    - **user** the username
    - **password** the password
    - **debug** *(optional, default `false`)* set to `console.log` to see info about running queries
    - **memoize** *(optional, default `false`)* duration in milliseconds to cache rows in process memory. I like setting this to 150ms to prevent fetching a row multiple times simultaneously.
    - **cache** *(optional, default `false`)* object with `get(key)` and/or `set(key, val)` methods (i.e. redis) to cache full rows (indefinitely). Cached rows are recached after `save()`/`insert()`/`update()`/`delete()`. The [Table functions](#table) fetch rows from the cache (and only fetch from sql the rows that are not cached).
    - **Promise** *(optional, default `global.Promise`)* You may plug in your own Promise library that is compatible with native promises, i.e. `Promise: require('bluebird')`. Then a promise will be returned if a callback is not specified.
- **cb** {Function} *(optional)* callback(err) If *cb* is not provided, a Promise is returned.

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

# Db

<a name="execute" />
## db.execute( sql, [data], [opts], [cb] )

Executes an arbitrary SQL query.
- **sql** {String|Array} the SQL statement
- **data** {Object} *(optional, unless `options` is specified)* parameterized query data
- **opts** {Object} *(optional)* query options
    - **write** {Boolean} if truthy, forces query to run on master db, otherwise attempts to run on a read-only host
    - **conString** {String} the connection string of the db
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

```js
db.execute([
  'select now()', // arrays can be used for es5 multi-line convenience
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
## db.executeWrite( sql, [data], [opts], [cb] )

Same as `execute()` but executes the query on a writable (master) host.

<a name="onReady" />
## db.onReady( cb )

Queues a function to be called when oreo's schema detection is complete (i.e. when oreo is initialized).
- **cb** {Function} callback(err) If *cb* is not provided, a Promise is returned.

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

/*
Output:
onReady #1
onReady #2
Ready!
*/
```

<a name="end" />
## db.end( [cb] )

Close the db connection(s).

# Table

<a name="find" />
## db.***table***.find( [opts], [cb] )

Finds one or more rows.
- **opts** {Object} *(optional)* options
    - **where** {String|Array|Object} the where clause criteria
    - **order** {String} i.e. `last_name ASC, age DESC`
    - **limit** {Number}
    - **offset** {Number}
    - **hydrate** {String|Array} hydrates the specified foreign keys
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

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
- {Object}

    ```js
    where: {
      field: 'abc',
      field2: {'>': 1}
    }
    ```

<a name="findOne" />
## db.***table***.findOne( opts, [cb] )

Finds exactly one row.
- **opts** {Object} same options as `find()`
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
db.authors.findOne({
  where: ["name ilike 'Jack%'"],
  order: 'name asc',
  offset: 5
}, function (err, author) {
  console.log(author.id) // 1
})
```

<a name="get" />
## db.***table***.get( primaryKey, [opts], [cb] )

Finds a row by primary key.
- **primaryKey** {String|Number|Object} the primary key of the row to get
- **opts** {Object} *(optional)* options
    - **hydrate** {String|Array} hydrates the specified foreign keys
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
var primaryKey = 1
// var primaryKey = { id: 1 } // this also works
db.authors.get(primaryKey, function (err, author) {
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

<a name="insert" />
## db.***table***.insert( data, [cb] )

Inserts a new row.
- **data** {Object} the data to insert into the db
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

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
  author: {  // "author" is the foreign key name
    name: 'Jack Kerouac'
  }
}, function (err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.hydrate('author', function (err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1, author: { id: 1, name: Jack Kerouac, books: [1] } }
  })
})
```

<a name="mget" />
## db.***table***.mget( primaryKeys, [opts], [cb] )

Gets many rows from the database by primary key.
- **primaryKeys** {Array} the primary keys of the rows to get
- **opts** {Object} *(optional)* options
    - **hydrate** {String|Array} hydrates the specified foreign keys
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

```js
var bookIds = [1]
db.books.mget(bookIds, function (err, books) {
  console.log(books)
  // [ { id: 1, title: On the Road, author_id: 1 } ]
})
```

<a name="table_save" />
## db.***table***.save( data, [cb] )

Inserts or updates depending on whether the primary key exists in the db.
- **data** {Object} the data to save
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

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

# Row

<a name="hydrate" />
## row.hydrate( foreignKeyName, [cb] )

Gets the record(s) linked with the specified foreign key(s)
- **foreignKeyName** {String|Array} the name of the foreign key constraint(s)
- **cb** {Function} *(optional)* callback(err) If *cb* is not provided, a Promise is returned.

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

<a name="save" />
## row.save( [cb] )

Saves the modified property values to the database (recursively).
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

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

<a name="set" />
## row.set( data )

Modifies multiple property values but does NOT save to the db.
- **data** {Object} the data to modify

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

Update an existing row. A convenience method for `set()` then `save()`.
- **data** {Object} the data to save
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
book.update({
  title: 'New Title'
}, function (err, book) {
  console.log(book)
  // { id: 1, title: New Title, author_id: 1 }
})
```

## Known Issues

- Tables containing `JSON` data type are not supported (use `JSONB` instead!)
