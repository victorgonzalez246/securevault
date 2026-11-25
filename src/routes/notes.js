// RF-04: CRUD de notas. A01: TODAS las consultas filtran por owner_id = usuario actual (anti-IDOR).
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Note, LIMITS, noteAad } from '../db/models.js';
import { encrypt, decrypt } from '../crypto/aes.js';
import { requireAuth, validate, HttpError } from '../middleware/security.js';
import { noteSchema, idParam } from '../schemas.js';
import { audit } from '../services/audit.js';

const toDto = (note, withContent = true) => ({
  id: note.id,
  title: decrypt(note.titleEnc, noteAad(note, 'title')),
  ...(withContent && { content: decrypt(note.contentEnc, noteAad(note, 'content')) }),
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

const encryptFields = (note, { title, content }) => {
  note.titleEnc = encrypt(title, noteAad(note, 'title'));
  note.contentEnc = encrypt(content, noteAad(note, 'content'));
};

// Busca la nota del usuario actual. Si existe pero es de otro, se registra el intento
// y se responde 404 (no se revela que la nota existe).
async function findOwnNote(req) {
  const note = await Note.findOne({ where: { id: req.valid.params.id, ownerId: req.user.id } });
  if (note) return note;
  const foreign = await Note.count({ where: { id: req.valid.params.id } });
  if (foreign) await audit(req, 'access_denied', { resource: 'note', noteId: req.valid.params.id });
  throw new HttpError(404, 'Nota no encontrada');
}

export function notesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const notes = await Note.findAll({ where: { ownerId: req.user.id }, order: [['updatedAt', 'DESC']] });
    res.json({ notes: notes.map((n) => toDto(n, false)), limit: LIMITS.MAX_NOTES_PER_USER });
  });

  router.post('/', validate(noteSchema), async (req, res) => {
    // A06: limite de negocio de notas por usuario
    const count = await Note.count({ where: { ownerId: req.user.id } });
    if (count >= LIMITS.MAX_NOTES_PER_USER) {
      return res.status(409).json({ error: `Limite de ${LIMITS.MAX_NOTES_PER_USER} notas alcanzado` });
    }
    const note = Note.build({ id: randomUUID(), ownerId: req.user.id });
    encryptFields(note, req.valid.body);
    await note.save();
    res.status(201).json({ note: toDto(note) });
  });

  router.get('/:id', validate(idParam, 'params'), async (req, res) => {
    res.json({ note: toDto(await findOwnNote(req)) });
  });

  router.put('/:id', validate(idParam, 'params'), validate(noteSchema), async (req, res) => {
    const note = await findOwnNote(req);
    encryptFields(note, req.valid.body);
    note.changed('updatedAt', true);
    await note.save();
    res.json({ note: toDto(note) });
  });

  router.delete('/:id', validate(idParam, 'params'), async (req, res) => {
    const note = await findOwnNote(req);
    await note.destroy();
    res.status(204).end();
  });

  return router;
}
