[![Oreo](https://raw.github.com/will123195/oreo/master/oreo.png)](https://github.com/will123195/oreo)



[![Build Status](https://travis-ci.org/will123195/oreo.svg?branch=master)](https://travis-ci.org/will123195/oreo)



## Features

- No configuration
- Automatically discovers schema and replication topology
- Apply CRUD operations and get linked objects
- Caching & memoization

## Database Support

- PostgreSQL 9+

## Installation

```bash
npm install oreo
npm install pg
```

## Example

```js
var oreo = require('oreo')

// instantiate and discover schema and network topology
var db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'database',
  user: 'username',
  pass: 'password'
}, runExampleQueries)

function runExampleQueries(err) {

  // Insert a new book and it's author
  db.books.insert({
    title: 'On the Road',
    author: {
      name: 'Jack Kerouac'
    }
  }, function(err, book) {
    console.log(book) // { id: 1, title: On the Road, author_id: 1 }

    // Get a linked object
    book.author(function(err, author) {
      console.log(author) // { id: 1, name: Jack Kerouac, books: [] }

      // Get multiple books using array of primary keys
      db.books.mget(author.books, function(err, books) {
        console.log(books)
      })
    })

    // Get the author by primary key
    db.authors.get(book.author_id, function(err, author) {
      console.log(author)
    })

    // Find authors by criteria
    db.authors.find({
      where: {author_id: book.author_id}
    }, function(err, authors) {
      console.log(authors) // [{ id: 1, name: Jack Kerouac, books: [] }]
    })

    // Update the book
    book.update({
      title: 'On The Road'
    }, function(err, book) {
      console.log(book)
    })
  })
}
```

The example above will work with the following database schema:
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
**Pro Tip:** [Create a trigger](https://github.com/will123195/oreo/wiki) to auto-populate `author.books[]`.

<hr />

## Intentionally Omitted Features

- ~~Schema configuration~~
- ~~Naming conventions~~
- ~~Migrations~~
- ~~Joins~~

## Documentation

### Database

* [`oreo`](#instantiate)
* [`discover`](#discover)
* [`execute`](#execute)

### Table

* [`find`](#find)
* [`findOne`](#findOne)
* [`get`](#get)
* [`insert`](#insert)
* [`mget`](#mget) (not yet implemented)

### Row

* [`hydrate`](#hydrate)
* [`save`](#save)
* [`set`](#set)
* [`update`](#update)

<hr />

## Database

<a name="instantiate" />
### oreo( opts, [cb] )

Instantiates the `db` object and configures the database connection string.

- **opts** {Object} db connection options
- **cb** {Function} *(optional)* callback(err)

```js
var oreo = require('oreo')
var db = oreo({
  driver: 'pg',
  hosts: ['localhost:5432'],
  name: 'database',
  user: 'username',
  pass: 'password'
}, function(err) {
  db.execute('select now() as now', function(err, rs) {
    console.log('now:', rs[0].now)
  })
})
```

<a name="discover" />
### db.discover( [cb] )

Re-discover the schema in the database.

- **cb** {Function} *(optional)* callback(err)

Adds a `Table` object to `db` for
each table in the database. Automatically runs when oreo is instantiated. Also, you can specify methods that will be bound to each `Row` object.

```js
db.discover(function(err) {
  // the Table API (see docs below) is now available:
  // db.authors
  // db.books

  // bind a method to all "book" objects
  db.books._methods.getTitle = function() {
    return this.title
  }
})
```

<a name="execute" />
### db.execute( query, [data], [options], [cb] )

Executes an arbitrary SQL query.
- **query** {String|Array} the SQL statement
- **data** {Object} *(optional)* parameterized query data
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

## Table

<a name="find" />
### db.table.find( opts, [cb] )

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

If no callback is provided a stream is returned.

<a name="findOne" />
### db.table.findOne( opts, [cb] )

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
### db.table.get( primaryKey, [cb] )

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
### db.table.insert( data, [cb] )

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
### db.table.mget( primaryKeys, [cb] ) NOT YET IMPLEMENTED

Gets many rows from the database by primary key:
```js
var bookIds = [1]
db.books.mget(bookIds, function(err, books) {
  console.log(books)
  // [ { id: 1, title: On the Road, author_id: 1 } ]
})
```

If no callback is provided a stream is returned.

## Row

<a name="hydrate" />
### row.hydrate( [cb] )

Populates the related data rows (1-to-1 foreign keys):
```js
db.books.get(1, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 }
  book.hydrate(function(err, book) {
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
### row.save( [cb] )

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
### row.set( data )

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
### row.update( data, [cb] )

Update an existing row:
```js
book.update({
  title: 'New Title'
}, function(err, book) {
  console.log(book)
  // { id: 1, title: New Title, author_id: 1 }
})
```
