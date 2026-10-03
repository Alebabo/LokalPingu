import type { LanguageCode } from './languages';

export interface BusinessProfile {
  id: 'main';
  language: LanguageCode;
  name: string;
  service: string;
  price: number | null;
  currency: string;
  checkIn: string;
  capacity: number | null;
  location: string;
  allergyPolicy: string;
  cancellationPolicy: string;
  updatedAt: string;
}

export interface BookingRecord {
  id: string;
  createdAt: string;
  customerMessage: string;
  customerMessageLocal: string;
  approvedReply: string;
  criticalDetails: string[];
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
}

export interface PriceItem {
  id: string;
  label: string;
  price: number;
  currency: string;
  unit: string;
  active: boolean;
}

const databaseName = 'lokalpingu';
const databaseVersion = 2;
type StoreName = 'profiles' | 'bookings' | 'products' | 'prices';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('profiles')) database.createObjectStore('profiles', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('bookings')) database.createObjectStore('bookings', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('products')) database.createObjectStore('products', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('prices')) database.createObjectStore('prices', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(storeName: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(result);
    });
  } finally {
    database.close();
  }
}

export function getProfile(): Promise<BusinessProfile | undefined> {
  return transact('profiles', 'readonly', (store) => store.get('main'));
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  await transact('profiles', 'readwrite', (store) => store.put(profile));
}

export async function saveBooking(booking: BookingRecord): Promise<void> {
  await transact('bookings', 'readwrite', (store) => store.put(booking));
}

export function listBookings(): Promise<BookingRecord[]> {
  return transact('bookings', 'readonly', (store) => store.getAll());
}

export function listProducts(): Promise<Product[]> {
  return transact('products', 'readonly', (store) => store.getAll());
}

export function listPrices(): Promise<PriceItem[]> {
  return transact('prices', 'readonly', (store) => store.getAll());
}

export async function saveProduct(product: Product): Promise<void> {
  await transact('products', 'readwrite', (store) => store.put(product));
}

export async function savePrice(price: PriceItem): Promise<void> {
  await transact('prices', 'readwrite', (store) => store.put(price));
}

export async function replaceCatalog(products: Product[], prices: PriceItem[]): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['products', 'prices'], 'readwrite');
      const productStore = transaction.objectStore('products');
      const priceStore = transaction.objectStore('prices');
      productStore.clear();
      priceStore.clear();
      for (const product of products) productStore.put(product);
      for (const price of prices) priceStore.put(price);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function clearBusinessData(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['profiles', 'bookings', 'products', 'prices'], 'readwrite');
      transaction.objectStore('profiles').clear();
      transaction.objectStore('bookings').clear();
      transaction.objectStore('products').clear();
      transaction.objectStore('prices').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

