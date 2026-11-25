// RF-05: dato sensible (telefono) cifrado con AES-256-GCM y mostrado enmascarado.
import { Router } from 'express';
import { User, phoneAad } from '../db/models.js';
import { encrypt, decrypt } from '../crypto/aes.js';
import { requireAuth, validate } from '../middleware/security.js';
import { profileSchema } from '../schemas.js';
import { audit } from '../services/audit.js';

export function maskPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return `***-***-${digits.slice(-4)}`;
}

async function readPhone(userId) {
  const user = await User.findByPk(userId, { attributes: ['id', 'phoneEnc'] });
  return user?.phoneEnc ? decrypt(user.phoneEnc, phoneAad(user.id)) : null;
}

export function profileRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const phone = await readPhone(req.user.id);
    res.json({ name: req.user.name, email: req.user.email, role: req.user.role, phoneMasked: maskPhone(phone) });
  });

  // Mostrar completo solo al dueno, y queda registrado en la bitacora
  router.get('/phone', async (req, res) => {
    const phone = await readPhone(req.user.id);
    await audit(req, 'sensitive_data_revealed', { field: 'phone' });
    res.set('Cache-Control', 'no-store').json({ phone });
  });

  router.put('/', validate(profileSchema), async (req, res) => {
    const { name, phone } = req.valid.body;
    const changes = { name };
    if (phone !== undefined) changes.phoneEnc = phone ? encrypt(phone, phoneAad(req.user.id)) : null;
    await User.update(changes, { where: { id: req.user.id } });
    res.json({ name, phoneMasked: maskPhone(phone ?? (await readPhone(req.user.id))) });
  });

  return router;
}
