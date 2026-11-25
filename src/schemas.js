// A05: validacion estricta de entrada con zod (.strict() rechaza campos extra,
// lo que evita asignacion masiva como enviar "role":"admin" al registrarse).
import { z } from 'zod';
import { LIMITS } from './db/models.js';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido'));

export const passwordPolicy = z
  .string()
  .min(12, 'La contrasena debe tener al menos 12 caracteres')
  .max(128, 'La contrasena no puede superar 128 caracteres')
  .regex(/[a-z]/, 'Debe incluir una minuscula')
  .regex(/[A-Z]/, 'Debe incluir una mayuscula')
  .regex(/\d/, 'Debe incluir un numero')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir un simbolo');

const name = z.string().trim().min(1, 'El nombre es obligatorio').max(80);
const phone = z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'Telefono invalido');

export const registerSchema = z.object({
  email,
  name,
  password: passwordPolicy,
  phone: phone.optional().or(z.literal('').transform(() => undefined)),
}).strict();

export const loginSchema = z.object({
  email: z.string().max(254),
  password: z.string().max(128),
}).strict();

export const forgotSchema = z.object({ email }).strict();

export const resetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Token invalido'),
  password: passwordPolicy,
}).strict();

export const noteSchema = z.object({
  title: z.string().trim().min(1, 'El titulo es obligatorio').max(LIMITS.MAX_NOTE_TITLE),
  content: z.string().min(1, 'El contenido es obligatorio').max(LIMITS.MAX_NOTE_CONTENT),
}).strict();

export const idParam = z.object({ id: z.uuid() });

export const profileSchema = z.object({
  name,
  phone: phone.optional().or(z.literal('').transform(() => null)),
}).strict();

export const userIdParam = z.object({ id: z.coerce.number().int().positive() });
export const roleSchema = z.object({ role: z.enum(['user', 'admin']) }).strict();
