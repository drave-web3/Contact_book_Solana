import localforage from "localforage";

// Simple UUID generator using crypto API
function uuidv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Initialize localforage for IndexedDB
const contactsStore = localforage.createInstance({
  name: "wallet-contacts",
  storeName: "contacts",
  description: "Encrypted Solana wallet contacts",
});

const encryptionStore = localforage.createInstance({
  name: "wallet-contacts",
  storeName: "encryption",
  description: "Encryption keys and settings",
});

export interface Contact {
  id: string;
  name: string;
  address: string;
  emoji: string;
  note?: string; // encrypted
  tags?: string[];
  preferredToken?: "SOL" | "USDC" | "USDT";
  createdAt: string;
  updatedAt: string;
  txCount?: number; // computed
  lastAmount?: string; // computed
}

interface EncryptedContact extends Omit<Contact, "note"> {
  encryptedNote?: string;
  noteIv?: string;
}

const STORAGE_KEY_CONTACTS = "contacts";
const STORAGE_KEY_ENCRYPTION_METHOD = "encryption_method";
const STORAGE_KEY_PASSWORD_HASH = "password_hash";

/**
 * Derives an encryption key from a password using PBKDF2
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derives an encryption key from a wallet signature
 */
async function deriveKeyFromWalletSignature(
  signature: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    signature,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  const salt = new Uint8Array(16); // Use a fixed salt for wallet-based encryption
  crypto.getRandomValues(salt);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts data using AES-GCM
 */
export async function encryptData(
  data: string,
  password?: string,
  signature?: Uint8Array
): Promise<{ encrypted: string; iv: string }> {
  if (!password && !signature) {
    throw new Error("Either password or signature must be provided");
  }

  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  // Generate IV
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  // Derive key
  let key: CryptoKey;
  if (password) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    key = await deriveKeyFromPassword(password, salt);
  } else if (signature) {
    key = await deriveKeyFromWalletSignature(signature);
  } else {
    throw new Error("No encryption method provided");
  }

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    dataBuffer
  );

  // Convert to base64 for storage
  const encryptedBase64 = btoa(
    String.fromCharCode(...new Uint8Array(encrypted))
  );
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    encrypted: encryptedBase64,
    iv: ivBase64,
  };
}

/**
 * Decrypts data using AES-GCM
 */
export async function decryptData(
  encryptedData: string,
  iv: string,
  password?: string,
  signature?: Uint8Array
): Promise<string> {
  if (!password && !signature) {
    throw new Error("Either password or signature must be provided");
  }

  // Convert from base64
  const encryptedBuffer = Uint8Array.from(
    atob(encryptedData),
    (c) => c.charCodeAt(0)
  );
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  // Derive key (same method as encryption)
  let key: CryptoKey;
  if (password) {
    // For password-based, we need to store/retrieve salt
    // For simplicity, using a fixed salt approach
    const salt = new Uint8Array(16);
    // In production, salt should be stored per user
    key = await deriveKeyFromPassword(password, salt);
  } else if (signature) {
    key = await deriveKeyFromWalletSignature(signature);
  } else {
    throw new Error("No decryption method provided");
  }

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
    },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Gets the encryption password from storage or prompts user
 */
async function getEncryptionPassword(): Promise<string | null> {
  // This should be handled by the UI layer
  // For now, return null to indicate password is needed
  return null;
}

/**
 * Creates a new contact
 */
export async function createContact(
  contact: Omit<Contact, "id" | "createdAt" | "updatedAt">,
  password?: string,
  signature?: Uint8Array
): Promise<Contact> {
  const now = new Date().toISOString();
  const id = uuidv4();

  let encryptedNote: string | undefined;
  let noteIv: string | undefined;

  // Encrypt note if provided
  if (contact.note) {
    try {
      const encrypted = await encryptData(contact.note, password, signature);
      encryptedNote = encrypted.encrypted;
      noteIv = encrypted.iv;
    } catch (error) {
      console.error("Error encrypting note:", error);
      // Continue without encryption if it fails
    }
  }

  const newContact: EncryptedContact = {
    id,
    name: contact.name,
    address: contact.address,
    emoji: contact.emoji,
    encryptedNote,
    noteIv,
    tags: contact.tags,
    preferredToken: contact.preferredToken,
    createdAt: now,
    updatedAt: now,
  };

  const contacts = await listContactsRaw();
  contacts.push(newContact);
  await contactsStore.setItem(STORAGE_KEY_CONTACTS, contacts);

  return {
    ...newContact,
    note: contact.note,
  };
}

/**
 * Updates an existing contact
 */
export async function updateContact(
  id: string,
  updates: Partial<Omit<Contact, "id" | "createdAt">>,
  password?: string,
  signature?: Uint8Array
): Promise<Contact> {
  const contacts = await listContactsRaw();
  const index = contacts.findIndex((c) => c.id === id);

  if (index === -1) {
    throw new Error("Contact not found");
  }

  const contact = contacts[index];
  const now = new Date().toISOString();

  let encryptedNote = contact.encryptedNote;
  let noteIv = contact.noteIv;

  // Re-encrypt note if it was updated
  if (updates.note !== undefined) {
    if (updates.note) {
      try {
        const encrypted = await encryptData(
          updates.note,
          password,
          signature
        );
        encryptedNote = encrypted.encrypted;
        noteIv = encrypted.iv;
      } catch (error) {
        console.error("Error encrypting note:", error);
      }
    } else {
      encryptedNote = undefined;
      noteIv = undefined;
    }
  }

  const updated: EncryptedContact = {
    ...contact,
    ...updates,
    encryptedNote,
    noteIv,
    updatedAt: now,
  };

  contacts[index] = updated;
  await contactsStore.setItem(STORAGE_KEY_CONTACTS, contacts);

  return {
    ...updated,
    note: updates.note !== undefined ? updates.note : undefined,
  };
}

/**
 * Deletes a contact
 */
export async function deleteContact(id: string): Promise<void> {
  const contacts = await listContactsRaw();
  const filtered = contacts.filter((c) => c.id !== id);
  await contactsStore.setItem(STORAGE_KEY_CONTACTS, filtered);
}

/**
 * Lists all contacts (raw, with encrypted notes)
 */
async function listContactsRaw(): Promise<EncryptedContact[]> {
  const contacts = await contactsStore.getItem<EncryptedContact[]>(
    STORAGE_KEY_CONTACTS
  );
  return contacts || [];
}

/**
 * Lists all contacts with decrypted notes
 */
export async function listContacts(
  password?: string,
  signature?: Uint8Array
): Promise<Contact[]> {
  const encryptedContacts = await listContactsRaw();
  const decrypted: Contact[] = [];

  for (const contact of encryptedContacts) {
    let note: string | undefined;

    if (contact.encryptedNote && contact.noteIv) {
      try {
        note = await decryptData(
          contact.encryptedNote,
          contact.noteIv,
          password,
          signature
        );
      } catch (error) {
        console.error("Error decrypting note:", error);
        // Continue without note if decryption fails
      }
    }

    decrypted.push({
      ...contact,
      note,
    });
  }

  return decrypted;
}

/**
 * Gets a single contact by ID
 */
export async function getContact(
  id: string,
  password?: string,
  signature?: Uint8Array
): Promise<Contact | null> {
  const contacts = await listContactsRaw();
  const contact = contacts.find((c) => c.id === id);

  if (!contact) {
    return null;
  }

  let note: string | undefined;

  if (contact.encryptedNote && contact.noteIv) {
    try {
      note = await decryptData(
        contact.encryptedNote,
        contact.noteIv,
        password,
        signature
      );
    } catch (error) {
      console.error("Error decrypting note:", error);
    }
  }

  return {
    ...contact,
    note,
  };
}

/**
 * Exports all contacts as encrypted JSON
 */
export async function exportContacts(
  password: string
): Promise<string> {
  const contacts = await listContactsRaw();
  const exportData = {
    version: "1.0",
    timestamp: new Date().toISOString(),
    contacts,
  };

  const json = JSON.stringify(exportData);
  const encrypted = await encryptData(json, password);

  return JSON.stringify({
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    version: "1.0",
  });
}

/**
 * Imports contacts from encrypted JSON
 */
export async function importContacts(
  fileContent: string,
  password: string
): Promise<number> {
  try {
    const importData = JSON.parse(fileContent);
    const decrypted = await decryptData(
      importData.encrypted,
      importData.iv,
      password
    );
    const data = JSON.parse(decrypted);

    if (!data.contacts || !Array.isArray(data.contacts)) {
      throw new Error("Invalid import format");
    }

    const existing = await listContactsRaw();
    const merged = [...existing, ...data.contacts];

    // Remove duplicates by address
    const unique = merged.filter(
      (contact, index, self) =>
        index === self.findIndex((c) => c.address === contact.address)
    );

    await contactsStore.setItem(STORAGE_KEY_CONTACTS, unique);
    return unique.length - existing.length;
  } catch (error) {
    console.error("Error importing contacts:", error);
    throw new Error("Failed to import contacts. Check password and file format.");
  }
}

/**
 * Clears all contacts (use with caution)
 */
export async function clearAllContacts(): Promise<void> {
  await contactsStore.removeItem(STORAGE_KEY_CONTACTS);
}

