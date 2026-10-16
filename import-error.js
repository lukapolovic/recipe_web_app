// Kept dependency-free so the link fetcher can use it without loading the HTML parser.
export class ImportError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
