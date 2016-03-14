var Book = function Book () {
  this.getTitle2 = function () {
    return this.title
  }
}

Book.prototype.getTitle = function () {
  return this.title
}

module.exports = Book