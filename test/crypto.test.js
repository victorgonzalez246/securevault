// A04: pruebas de hash y cifrado (no requieren peticiones HTTP).
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, keyVersionOf } from '../src/crypto/aes.js';
import { hashPassword, verifyPassword } from '../src/crypto/password.js';
import { generateToken, hashToken } from '../src/crypto/tokens.js';

describe('Argon2id (contrasenas)', () => {
  it('genera hashes $argon2id$ con los parametros OWASP y verifica', async () => {
    const hash = await hashPassword('Contrasena#Segura1');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'Contrasena#Segura1')).toBe(true);
    expect(await verifyPassword(hash, 'otra')).toBe(false);
  });

  it('usa sal aleatoria: la misma contrasena produce hashes distintos', async () => {
    expect(await hashPassword('Igual#123456a')).not.toBe(await hashPassword('Igual#123456a'));
  });
});

describe('AES-256-GCM (datos sensibles)', () => {
  it('cifra y descifra con formato v<version>.iv.tag.datos', () => {
    const c = encrypt('nota secreta', 'aad');
    expect(c).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(c).not.toContain('nota secreta');
    expect(decrypt(c, 'aad')).toBe('nota secreta');
  });

  it('usa un IV distinto en cada cifrado (nunca reutiliza IV)', () => {
    const ivs = new Set(Array.from({ length: 200 }, () => encrypt('x').split('.')[1]));
    expect(ivs.size).toBe(200);
    expect(Buffer.from([...ivs][0], 'base64')).toHaveLength(12);
  });

  it('detecta manipulacion del texto cifrado (tag de autenticacion)', () => {
    const [v, iv, tag, data] = encrypt('saldo: 100', 'aad').split('.');
    const bytes = Buffer.from(data, 'base64');
    bytes[0] ^= 0xff;
    expect(() => decrypt([v, iv, tag, bytes.toString('base64')].join('.'), 'aad')).toThrow();
  });

  it('falla si el cifrado se mueve a otro registro (AAD distinto)', () => {
    const c = encrypt('telefono de A', 'user:1:phone');
    expect(() => decrypt(c, 'user:2:phone')).toThrow();
  });

  it('soporta rotacion: descifra datos de la version anterior', () => {
    const old = encrypt('dato viejo', 'aad', 2);
    expect(keyVersionOf(old)).toBe(2);
    expect(decrypt(old, 'aad')).toBe('dato viejo');
  });
});

describe('Tokens de recuperacion', () => {
  it('genera 256 bits aleatorios y guarda solo SHA-256', () => {
    const t = generateToken();
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });
});
