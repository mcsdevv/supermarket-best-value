// eslint-disable-next-line no-redeclare -- Augments built-in chrome namespace for extension APIs
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(key: string, callback: (result: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    }
    const local: StorageArea;
  }
}
