# oreo

A simple ORM for PostgreSQL

## Features

- No configuration necessary
- Automatically discovers tables, primary keys, foreign keys and master/standby servers
- Ability to "hydrate" foreign keys (and arrays of foreign keys)
- Object caching / Query memoization

## Installation

```bash
npm install oreo
npm install pg
```

## Example

Suppose we have the following schema:
```sql
CREATE TABLE author (
  id SERIAL,
  name VARCHAR,
  books INTEGER[],
  CONSTRAINT author_pkey PRIMARY KEY(id)
);

CREATE TABLE book (
  id SERIAL,
  title VARCHAR,
  author_id INTEGER,
  CONSTRAINT book_pkey PRIMARY KEY(id),
  CONSTRAINT book_fk1 FOREIGN KEY (author_id) REFERENCES author(id)
);
```

Discover the tables in the database and insert some rows:
```js
var oreo = require('oreo')
var pg = require('pg')
var db = oreo(pg)

// discover tables, primary keys and foreign keys
db.discover().on('ready', function() {
  
  // insert a new row
  db.book.insert({
    title: 'On the Road',
    author: {
      name: 'Jack Kerouac'
    }
  }, function(err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1 } 
    db.author.get(book.author_id, function(err, author) {
      console.log(author)
      // { id: 1, name: Jack Kerouac, books: [ 1 ] }
    })
  })
})
```

## Documentation

### initialize

* [`oreo`](#initialize)

### Database

* [`discover`](#discover)
* [`execute`](#execute)

### Table

* [`find`](#find)
* [`findOne`](#findOne)
* [`get`](#get)
* [`insert`](#insert)
* [`mget`](#mget)

### Row

* [`hydrate`](#hydrate)
* [`save`](#save)
* [`set`](#set)
* [`update`](#update)

## Initialize

### oreo( pg, [opts] )

```js
var oreo = require('oreo')
var pg = require('pg')
var db = oreo(pg, {
  hosts: ['localhost'],
  port: 5432,
  name: 'postgres',
  user: 'postgres',
  pass: 'postgres'
})
```

## Database

<a name="discover" />
### db.discover( [cb] )

Adds a property to the `db` object for every table in the database.

```js
db.discover()
```

You may specify a constructor which will be executed by the [`get`](#get) method.  This is useful if you need dynamically calculated properties, i.e. calculate `age` based on `birthdate`:
```js
db.author._meta.constructor = function() {
  this.num_books = this.books.length
}
```

<a name="execute" />
### db.execute( query, [opts], [cb] )

Executes SQL query.

## Table

<a name="find" />
### db.mytable.find( opts, [cb] )

Find one or more rows:
```js
db.author.find({
  where: ["name ilike 'Jack%'"],
  order: 'name asc',
  offset: 5,
  limit: 5
}, function(err, authors) {
  console.log(authors[0].num_books) // 1
})
```

<a name="findOne" />
### db.mytable.findOne( [cb] )

<a name="get" />
### db.mytable.get( id, [cb] )

<a name="insert" />
### db.mytable.insert( data, [cb] )

<a name="mget" />
### db.mytable.mget( ids, [cb] )

Get multi-dimensional (1-to-many) data from the database:
```js
db.author.get(1, function(err, author) {
  console.log(author)
  // { id: 1, name: Jack Kerouak, books: [1] } 
  db.books.mget(author.books, function(err, books) {
    author.books = books
    console.log(author)
    // { id: 1, name: Jack Kerouac, books: [ { id: 1, title: On the Road, author_id: 1 } ] }
  })
})
```

## Row

<a name="hydrate" />
### row.hydrate( [cb] )

Get multi-dimensional (1-to-1) data from the database:
```js
db.book.get(1, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 } 
  book.hydrate(function(err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1, author: { id: 1, name: Jack Kerouac, books: [1] } }
  })
})
```

<a name="save" />
### row.save( [data], [cb] )

<a name="set" />
### row.set( data )

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

## Advanced Usage

### Create triggers that automatically populate arrays of 1-to-many foreign keys

```sql
CREATE OR REPLACE FUNCTION author_books() RETURNS trigger AS
$body$
BEGIN
  IF TG_OP != 'INSERT' THEN
    UPDATE author
    SET books = (
      SELECT ARRAY(
        SELECT id
        FROM book
        WHERE author_id = OLD.author_id
        ORDER BY title ASC
      )
    )
    WHERE id = OLD.author_id;
  END IF;
  UPDATE author
  SET books = (
    SELECT ARRAY(
      SELECT id
      FROM book
      WHERE author_id = NEW.author_id
      ORDER BY title ASC
    )
  )
  WHERE id = NEW.author_id;
  RETURN null;
END;
$body$
LANGUAGE 'plpgsql';

CREATE TRIGGER book_tr1
  AFTER INSERT OR UPDATE OF author_id OR DELETE 
  ON book FOR EACH ROW 
  EXECUTE PROCEDURE author_books();
```

### Create triggers that "replicate" to Redis Foreign Data Wrapper (for high-speed reads)

