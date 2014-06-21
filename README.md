# oreo

A simple ORM for PostgreSQL

## Features

- No configuration necessary
- Automatically discovers tables, primary keys and foreign keys
- Ability to "hydrate" foreign keys
- Ability to "hydrate" arrays of foreign keys
- Object caching / Query memoization

## Usage

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

```js
var oreo = require('oreo')
var db = oreo()    // defaults to localhost:5432
db.discover()      // discover tables, primary keys and foreign keys

db.book.insert({
  title: 'On the Road',
  author: {
    name: 'Jack Kerouac'
  }
}, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 } 
})
```

```js
db.book.get(book.id, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 } 
  book.hydrate(function(err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1, author: { name: Jack Kerouac, books: [1] } }

    book.update({
      title: 'New Title'
    }, function(err, book) {
      console.log(book)
      // { id: 1, title: New Title, author_id: 1 } 
    })
  })
})
```

```js
db.configure('')

db.author.get(1, function(err, author) {
  author.hydrate('books')
  // author.books[0].title
})

db.album.find({
  order: 'name asc',
  offset: 5,
  limit: 5
}, function(err, albums) {

})
```

## Documentation

### Database

* [`configure`](#configure)
* ['discover'](#discover)
* ['execute'](#execute)

### Table

* ['find'](#find)
* ['findOne'](#findOne)
* ['get'](#get)
* ['insert'](#insert)

### Record

* ['hydrate'](#hydrate)
* ['save'](#save)
* ['update'](#update)

## Advanced Usage

### Create triggers that automatically populate arrays of 1-to-many foreign keys

```sql
CREATE OR REPLACE FUNCTION author_books () RETURNS trigger AS
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

