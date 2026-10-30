// src/ingestion/bounded-map.ts
// Map có giới hạn kích thước: đầy thì bỏ mục cũ nhất (thứ tự chèn).
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) { super(); }
  override set(key: K, value: V): this {
    if (!this.has(key) && this.size >= this.max) {
      const oldest = this.keys().next();
      if (!oldest.done) this.delete(oldest.value);
    }
    return super.set(key, value);
  }
}
