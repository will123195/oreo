[![Oreo](oreo.png)](https://github.com/will123195/oreo)


[![Build Status](https://travis-ci.org/will123195/oreo.svg?branch=master)](https://travis-ci.org/will123195/oreo)

# Features

- No dependencies
- Database-first ORM with no configuration needed
- Auto-detects tables, columns, primary keys and foreign keys
- Saves multi-table nested objects with an atomic transaction
- Detects primary and read-only hosts (from specified list of hosts)

# Database Support

- PostgreSQL 9+
- MySQL

# Installation

```bash
npm i oreo pg@6 mysql
```

# Quick Example

```js
import oreo from 'oreo'

const db = oreo({
  driver: 'pg',
  hosts: ['localhost'],
  name: 'my_db',
  user: 'root',
  pass: ''
}

db.onReady(async () => {
  // Assuming you have a table "artists"
  // Get an artist by primary key
  const artist = await db.artists.get(id)
  console.log(artist)
})
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

* [`count`](#count)
* [`find`](#find)
* [`findOne`](#findOne)
* [`get`](#get)
* [`insert`](#insert)
* [`mget`](#mget)
* [`save`](#table_save)

## Row

* [`delete`](#delete)
* [`hydrate`](#hydrate)
* [`save`](#save)
* [`set`](#set)
* [`update`](#update)

<hr />

# Full Example

&dagger; see the example database schema below

```js
import oreo from 'oreo'

// initialize oreo: auto-detects the schema and determines writable/read-only hosts
const db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'my_db',
  user: 'username',
  pass: 'password',
  debug: console.log,
  memoize: 150, // optional duration in ms to memoize rows
  cache: redisClient, // optional
  Promise: Promise, // optional, default: global.Promise
  models: {}, // optional
  schema: {} // optional skips auto-detect schema
})

async function examples() {

  // Insert a new book, its author and some reviews (in a single transaction)
  let book = await db.books.insert({
    title: 'Fear and Loathing in Las Vegas',
    author: {
      name: 'Hunter S.Thompson'
    },
    reviews: [ // shorthand for 'book:reviews'
      { stars: 5, body: 'Psychadelic!'},
      { stars: 4, body: 'Bizarre, unpredictable yet strangely alluring.'}
    ]
  })
  console.log(book) // { id: 1, title: Fear and Loathing in Las Vegas, author_id: 1 }

  // Get the book's author (1-to-1 linked row)
  await book.hydrate('author')
  console.log(book.author) // { id: 1, name: Hunter S. Thompson }

  // Get the book's reviews (1-to-many linked rows)
  await book.hydrate('reviews')
  console.log(book.reviews) // array

  // Update a book
  await book.update({
    title: 'The Rum Diary'
  })
  console.log(book) // { id: 1, title: The Rum Diary, author_id: 1 }

  // Delete a book
  await book.delete()
  console.log(book) // {}

  // Get an author by primary key
  let author = await db.authors.get(1)
  console.log(author) // { id: 1, name: Hunter S. Thompson }

  // Get multiple authors by primary key
  let authors = await db.authors.mget([1])
  console.log(authors) // [ { id: 1, name: Hunter S. Thompson } ]

  // Find authors
  authors = await db.authors.find({
    where: {
      name: 'Hunter S. Thompson'
    },
    order: 'name asc',
    limit: 10,
    offset: 0
    }
  })
  console.log(authors) // [ { id: 1, name: Hunter S. Thompson } ]

  // Find one author
  author = await db.authors.findOne({
    where: [
      "name like 'Hunter %'"
    ]
  })
  console.log(author) // { id: 1, name: Hunter S. Thompson }
}

db.onReady(examples)
```

Example database schema:
```sql
create table authors (
  id serial,
  name varchar,
  constraint author_pkey primary key(id)
);

create table books (
  id serial,
  title varchar,
  author_id integer,
  constraint book_pkey primary key(id),
  constraint author foreign key (author_id) references authors(id)
);

create table reviews (
  id serial,
  book_id integer,
  stars integer,
  body varchar,
  constraint review_pkey primary key(id),
  constraint book foreign key (book_id) references book(id)
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
    - **driver** {String} `pg` or `mysql`
    - **hosts** {Array} list of possible hosts, each is checked to see if it is online and writable or read-only
    - **name** {String} the database name
    - **user** {String} the username
    - **password** {String} the password
    - **debug** {Function} *(optional, default `false`)* set to `console.log` to see info about running queries
    - **memoize** {Integer} *(optional, default `false`)* duration in milliseconds to cache rows in process memory. Setting this to `150` is generally a no-brainer to prevent redundant queries.
    - **cache** {Object} *(optional, default `false`)* object with `get(key)` and/or `set(key, val)` methods (i.e. redis) to cache full rows (indefinitely). Cached rows are recached after `save()`/`insert()`/`update()`/`delete()`. The [Table functions](#table) fetch rows from the cache (and only fetch from sql the rows that are not cached).
    - **Promise** {Object} *(optional, default `global.Promise`)* You may plug in your own Promise library that is compatible with native promises, i.e. `Promise: require('bluebird')`. Then a promise will be returned if a callback is not specified.
    - **models** {Object} *(optional)* each table may have a model "class" specified which will be used to instantiate rows from that table. For example, `models.my_table = class MyTable {}`
    - **schema** {Object} *(optional)* initialize oreo faster by specifying the schema, for example `JSON.parse(JSON.stringify(db))`
- **cb** {Function} *(optional)* callback(err)

```js
const oreo = require('oreo')
const db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'database',
  user: 'username',
  pass: 'password',
  //debug: false, //console.log
  //memoize: 0,
  //cache: null,
  //Promise: global.Promise
  //models: {},
  //schema: {}
}, function (err) {
  db.execute('select now() as now')
  .then(rows => {
    console.log('now:', rows[0].now)
  })
})
```

# Db

<a name="execute" />

## db.execute( sql, [data], [opts], [cb] )

Executes an arbitrary SQL query.

- **sql** {String|Array} the SQL statement
- **data** {Object} *(optional, unless `opts` is specified)* parameterized query data
- **opts** {Object} *(optional)* query options
    - **write** {Boolean} if truthy, forces query to run on master db, otherwise attempts to run on a read-only host
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

```js
db.execute([
  'select now()', // arrays can be used for es5 multi-line convenience
  'as now'
])
.then(rows => {
  console.log(rows[0]) // 2014-06-24 21:03:08.652861-04
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
})
.then(rows => {
  console.log(rows[0].id) // 1
})
.catch(err => {

})
```

<a name="executeWrite" />

## db.executeWrite( sql, [data], [opts], [cb] )

Same as [`execute`](#execute) but executes the query on a writable (primary) host.

<a name="onReady" />

## db.onReady( cb )

Queues a function to be called when oreo's schema detection is complete (i.e. when oreo is initialized).

- **cb** {Function} callback()

```js
const db = oreo(config, (err) => {
  console.log('Ready!')
})
.onReady(() => {
  console.log('onReady #1')
})
db.onReady(() => {
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

Closes the db connection(s).

# Table

<a name="count" />

## db.***table***.count( [opts], [cb] )

Counts the number of rows matching the specified criteria.

- **opts** {Object} *(optional)* options
    - **where** {String|Array|Object} the where clause criteria
    - **params** {Object} key/value pairs to be substituted for `:key` patterns in the query
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

```js
db.authors.count({
  where: {
    name: 'Jack'
  }
})
.then(count => {
  console.log(count) // 1
})
```

<a name="find" />

## db.***table***.find( [opts], [cb] )

Finds multiple rows.

- **opts** {Object} *(optional)* options
    - **where** {String|Array|Object} the where clause criteria
    - **order** {String} i.e. `last_name ASC, age DESC`
    - **limit** {Number}
    - **offset** {Number}
    - **hydrate** {String|Array} hydrates the specified foreign keys (see [`hydrate`](#hydrate))
    - **params** {Object} key/value pairs to be substituted for `:key` patterns in the query
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

```js
db.authors.find({
  where: [ "name like 'Jack%'" ],
  order: 'name asc',
  offset: 5,
  limit: 5,
  hydrate: ['books']
})
.then(authors => {
  console.log(authors)
  // [ { id: 1, name: Jack Kerouac, books: [ { id: 1, title: On the Road, author_id: 1 } ] } ]
})
```

The `where` option has several valid formats:
- {String}

    ```js
    where: "field = :f1 and field2 > :f2",
    params: {
      f1: 'abc',
      f2: 1
    }
    ```
- {Array}

    ```js
    where: [
      "field = :f1",
      "field2 > :f2"
    ],
    params: {
      f1: 'abc',
      f2: 1
    }
    ```
- {Object}

    ```js
    where: {
      field: 'abc',
      field2: { $gt: 1 } // query operators are coming soon
    }
    ```

<a name="findOne" />

## db.***table***.findOne( opts, [cb] )

Finds exactly one row.

- **opts** {Object} same options as [`find`](#find)
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
db.authors.findOne({
  where: [ "name like 'Jack%'" ],
  order: 'name asc',
  offset: 5
})
.then(author => {
  console.log(author.id) // 1
})
```

<a name="get" />

## db.***table***.get( primaryKey, [opts], [cb] )

Gets a row by primary key.

- **primaryKey** {String|Number|Object} the primary key of the row to get
- **opts** {Object} *(optional)* options
    - **hydrate** {String|Array} hydrates the specified foreign keys (see [`hydrate`](#hydrate))
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
const primaryKey = 1 // const primaryKey = { id: 1 } // this also works
db.authors.get(primaryKey)
.then(author => {
  console.log(author) // { id: 1, name: Jack Kerouak }
})
```

Multi-column (composite) primary key:
```js
const primaryKey = {
  company: 'Cogswell Cogs',
  part_no: 'A-12345'
}
db.parts.get(primaryKey)
.then(part => {
  console.log(part) // { company: Cogswell Cogs, part_no: A-12345, price: 9.99, in_stock: true }
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
})
.then(book => {
  console.log(book) // { id: 1, title: On the Road, author_id: 1 }
})
```

Insert multiple rows into related tables in a single transaction:
```js
db.books.insert({
  title: 'On the Road',
  author: {  // "author" is the foreign key name (1-to-1)
    name: 'Jack Kerouac'
  },
  reviews: [ // shorthand for 'book:reviews' <foreignKeyName>:<tableName> (1-to-many)
    { stars: 5, body: 'Psychadelic!'},
    { stars: 4, body: 'Bizarre, unpredictable yet strangely alluring.'}
  ]
})
.then(book => {
  console.log(book) // { id: 1, title: On the Road, author_id: 1 }
})
```

See also: [`hydrate`](#hydrate)

<a name="mget" />

## db.***table***.mget( primaryKeys, [opts], [cb] )

Gets many rows by primary key in the specified order. A `null` value will be returned for each primary key that does not exist.

- **primaryKeys** {Array} the primary keys of the rows to get
- **opts** {Object} *(optional)* options
    - **hydrate** {String|Array} hydrates the specified foreign keys (see [`hydrate`](#hydrate))
- **cb** {Function} *(optional)* callback(err, rows) If *cb* is not provided, a Promise is returned.

```js
const bookIds = [1]
db.books.mget(bookIds)
.then(books => {
  console.log(books) // [ { id: 1, title: On the Road, author_id: 1 } ]
})
```

<a name="table_save" />

## db.***table***.save( data, [cb] )

Inserts or updates depending on whether the primary key exists in the db.

- **data** {Object} the data to save to the db
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
const formPOST = {
  id: 1,
  title: 'New Title'
}
db.books.save(formPOST)
.then(book => {
  console.log(book) // { id: 1, title: New Title, author_id: 1 }
})
```

# Row

<a name="delete" />

## row.delete( [cb] )

Deletes an existing row from the database.

- **cb** {Function} *(optional)* callback(err) If *cb* is not provided, a Promise is returned.

```js
book.delete()
.then(() => {
  console.log(book) // {}
})
```

<a name="hydrate" />

## row.hydrate( propertyName, [cb] )

Hydrates the row(s) linked with the specified foreign key(s) and/or foreign table(s).

- **propertyName** {String|Array} the name of the hydratable property to fetch and attach to this row. There are two types of hydratable property names:
    - 1-to-1 foreign key constraint name
    - 1-to-many foreign table name
- **cb** {Function} *(optional)* callback(err) If *cb* is not provided, a Promise is returned.

```js
db.books.get(1)
.then(book => {
  console.log(book) // { id: 1, title: On the Road, author_id: 1 }

  // hydrate a 1-to-1 linked row
  book.hydrate('author')
  .then(() => {
    console.log(book.author) // { id: 1, name: Jack Kerouac }
  })

  // hydrate 1-to-many linked rows
  book.hydrate('reviews')
  .then(() => {
    console.log(book.reviews) // [ { stars: 5, body: 'Psychadelic!' }, { stars: 4, body: 'Bizarre...' } ]
  })
})
```

When hydrating a 1-to-1 row, the **propertyName** is the name of the foreign key constraint.

For example, a book has one author, so we have a table `books` with a column `author_id` which has a foreign key constraint named `author` which links to `author.id`.

```js
// 1-to-1
book.hydrate('author')
.then(() => {
  console.log(book.author) // { id: 1, name: Jack Kerouac }
})
```

When hydrating 1-to-many rows, it is recommended to specify the fully qualified hydratable **propertyName** formatted as `foreignKeyName:tableName`. However, for convenience, if the foreign table has only one foreign key that references this table, you may omit `foreignKeyName:` and simply use `tableName` shorthand notation.

For example, a book has many reviews, so we have a table `reviews` with a column `book_id` which has a foreign key constraint named `book` which links to `book.id`.

```js
// 1-to-many (fully qualified notation)
book.hydrate('book:reviews')
.then(() => {
  console.log(book['book:reviews'])
  // [ { stars: 5, body: 'Psychadelic!' }, { stars: 4, body: 'Bizarre...' } ]
})

// 1-to-many (shorthand notation)
book.hydrate('reviews')
.then(() => {
  console.log(book.reviews)
  // [ { stars: 5, body: 'Psychadelic!' }, { stars: 4, body: 'Bizarre...' } ]
})
```

Hydrate multiple properties in parallel:

```js
book.hydrate(['author', 'reviews'])
.then(() => {
  console.log(book)
  // {
  //   id: 1,
  //   title: On the Road,
  //   author_id: 1,
  //   author: { id: 1, name: Jack Kerouac },
  //   reviews: [ { stars: 5, body: 'Psychadelic!' }, { stars: 4, body: 'Bizarre...' } ]
  // }
})
```

<a name="save" />

## row.save( [cb] )

Saves the modified property values to the database (and saves linked rows recursively).

- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
db.books.get(1)
.then(book => {
  console.log(book) // { id: 1, title: On the Road, author_id: 1 }
  book.author_id = 2
  book.save()
  .then(book => {
    console.log(book) // { id: 1, title: On the Road, author_id: 2 }
  })
})
```

<a name="set" />

## row.set( data )

Modifies multiple property values but does NOT save to the db.

- **data** {Object} the data to modify

```js
db.books.get(1)
.then(book => {
  console.log(book) // { id: 1, title: On the Road, author_id: 1 }

  book.set({
    title: 'New Title',
    author_id: 2
  })

  book.save()
  .then(book => {
    console.log(book) // { id: 1, title: New Title, author_id: 2 }
  })
})
```

<a name="update" />

## row.update( data, [cb] )

Updates an existing row. A convenience method for `set()` then `save()`.

- **data** {Object} the data to save
- **cb** {Function} *(optional)* callback(err, row) If *cb* is not provided, a Promise is returned.

```js
book.update({
  title: 'New Title'
})
.then(book => {
  console.log(book) // { id: 1, title: New Title, author_id: 1 }
})
```

## Known Issues

- Postgres tables containing `JSON` data type are not supported (use `JSONB` instead!)
