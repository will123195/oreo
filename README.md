[![Oreo](oreo.png)](https://github.com/will123195/oreo)


[![Build Status](https://travis-ci.org/will123195/oreo.svg?branch=master)](https://travis-ci.org/will123195/oreo)


# Features

- Automatically discovers master/read-only hosts
- Detects relationships (primary keys and foreign keys)
- Optional object caching & memoization
- Saves nested objects in a single transaction
- Supports composite primary keys
- Zero boilerplate

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
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'my_db',
  user: 'postgres',
  pass: 'password'
}, function(err) {
  // Get a row by primary key
  db.my_table_name.get(id, function(err, row) {
    console.log(row)
  })
}
```

# Full Example

&dagger; see the example database schema below

```js
var oreo = require('oreo')

// discover schema and replication topology
var db = oreo({
  driver: 'mysql',
  hosts: ['localhost:5432'],
  name: 'my_db',
  user: 'root',
  pass: 'password',
  debug: false,
  memoize: 150, // ms
  cache: redisClient
}, runExampleQueries)

function runExampleQueries(err) {

  // Insert a new book and its author
  db.books.insert({
    title: 'Fear and Loathing in Las Vegas',
    author: {
      name: 'Hunter S.Thompson'
    }
  }, function(err, book) {
    console.log(book) // { id: 1, title: Fear and Loathing in Las Vegas, author_id: 1 }

    // Get a linked object
    book.hydrate('author', function(err, author) {
      console.log(book.author) // { id: 1, name: Hunter S. Thompson, books: [] }

      // Get multiple books using array of primary keys
      db.books.mget(author.books, function(err, books) {
        console.log(books)
      })
    })

    // Get an author by primary key
    db.authors.get(1, function(err, author) {
      console.log(author)
    })

    // Find authors by criteria
    db.authors.find({
      where: {
        author_id: 1
      }
    }, function(err, authors) {
      console.log(authors) // [{ id: 1, name: Hunter S. Thompson, books: [] }]
    })

    // Update the book
    book.update({
      title: 'The Rum Diary'
    }, function(err, book) {
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

# Documentation

## Main

* [`oreo`](#instantiate)
* [`discover`](#discover)
* [`execute`](#execute)

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

# Main

<a name="instantiate" />
## oreo( opts, [cb] )

Instantiates the `db` object and configures the database connection string(s).

- **opts** {Object} options
- **cb** {Function} *(optional)* callback(err)

```js
var oreo = require('oreo')
var db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'database',
  user: 'username',
  pass: 'password',
  //debug: false,
  //memoize: 150, // ms to cache data objects in process memory
  //cache: null // object with get/set methods to cache data objects, i.e. redisClient
}, function(err) {
  db.execute('select now() as now', function(err, rs) {
    console.log('now:', rs[0].now)
  })
})
```

<a name="discover" />
## db.discover( [cb] )

Re-discover the schema in the database.

- **cb** {Function} *(optional)* callback(err)

For each table in the database, a property `db.<table_name>` whose value is a `Table` object will be defined.
Automatically runs when oreo is instantiated. Also, you can specify methods that will be bound to each `Row` that is instantiated by `Table.get()`.

```js
db.discover(function(err) {
  // the Table API (see docs below) is now available for each table:
  // db.authors
  // db.books

  // bind a method to all "book" `Row` objects
  db.books._methods.getTitle = function() {
    return this.title
  }

  // for example:
  db.books.get(1, function(err, book) {
    // book.getTitle()
  })
})
```

<a name="execute" />
## db.execute( query, [data], [options], [cb] )

Executes an arbitrary SQL query.
- **query** {String|Array} the SQL statement
- **data** {Object} *(optional, unless `options` is specified)* parameterized query data
- **options** {Object} *(optional)* query options
    - `write` *(optional)* if truthy, forces query to run on master db, otherwise attempts to run on a read-only host
    - `conString` *(optional)* the connection string of the db
- **cb** {Function} *(optional)* callback(err, results)

```js
db.execute([
  'select now()', // arrays can be used for multi-line convenience
  'as now'
], function(err, rs) {
  console.log(rs[0]) // 2014-06-24 21:03:08.652861-04
})
```

Parameterized query (SQL injection safe):
```js
db.execute([
  'select id',
  'from authors',
  'where name = :name'
], {
  name: 'Jack Kerouac',
}, function(err, rs) {
  console.log(rs[0].id) // 1
})
```

If no callback is provided a stream is returned:
```js
db.execute('select now()')
.on('data', function(row) {

})
.on('error', function(error) {

})
.on('end', function(result) {

})
```

# Table

<a name="find" />
## db.table.find( opts, [cb] )

Finds one or more rows:
```js
db.authors.find({
  where: ["name ilike 'Jack%'"],
  order: 'name asc',
  offset: 5,
  limit: 5
}, function(err, authors) {
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

If no callback is provided a stream is returned.

<a name="findOne" />
## db.table.findOne( opts, [cb] )

Finds exactly one row:
```js
db.authors.findOne({
  where: ["name ilike 'Jack%'"],
  order: 'name asc',
  offset: 5
}, function(err, author) {
  console.log(author.id) // 1
})
```

If no callback is provided a stream is returned.

<a name="get" />
## db.table.get( primaryKey, [cb] )

Finds a row by primary key:
```js
db.authors.get(1, function(err, author) {
  console.log(author) // { id: 1, name: Jack Kerouak, books: [1] }
})
```

Multi-column (composite) primary key:
```js
db.parts.get({
  company: 'Cogswell Cogs',
  part_no: 'A-12345'
}, function(err, part) {

})
```

<a name="insert" />
## db.table.insert( data, [cb] )

Inserts a new row.
```js
db.books.insert({
  title: 'On the Road',
  author_id: 1
}, function(err, book) {
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
}, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.hydrate(function(err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1, author: { id: 1, name: Jack Kerouac, books: [1] } }
  })
})
```

<a name="mget" />
## db.table.mget( primaryKeys, [cb] )

Gets many rows from the database by primary key:
```js
var bookIds = [1]
db.books.mget(bookIds, function(err, books) {
  console.log(books)
  // [ { id: 1, title: On the Road, author_id: 1 } ]
})
```

If no callback is provided a stream is returned.

<a name="table_save" />
## db.table.save( data, [cb] )

Inserts or updates depending on whether the primary key exists in the db.
```js
var formPOST = {
  id: 1,
  title: 'New Title'
}
db.books.save(formPOST, function(err, book) {
  console.log(book)
  // { id: 1, title: New Title, author_id: 1 }
})
```

# Row

<a name="hydrate" />
## row.hydrate( fkConstraintName, [cb] )

Gets the linked record (foreign key)
```js
db.books.get(1, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.hydrate('author', function(err) {
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

Saves the modified property values to the database (recursively):
```js
db.books.get(1, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.author_id = 2
  book.save(function(err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 2 }
  })
})
```

<a name="set" />
## row.set( data )

Sets multiple property values but does not save yet:
```js
db.books.get(1, function(err, book) {
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
}, function(err, book) {
  console.log(book)
  // { id: 1, title: New Title, author_id: 1 }
})
```
