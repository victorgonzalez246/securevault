// RF-07: panel de administracion. A01: requireRole('admin') verificado en el servidor.
import { Router } from 'express';
import { User, AuditLog } from '../db/models.js';
import { requireRole, validate } from '../middleware/security.js';
import { userIdParam, roleSchema } from '../schemas.js';
import { audit } from '../services/audit.js';

export function adminRouter() {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/users', async (req, res) => {
    const users = await User.findAll({
      attributes: ['id', 'email', 'name', 'role', 'failedAttempts', 'lockedUntil', 'createdAt'], // sin hashes ni datos cifrados
      order: [['id', 'ASC']],
    });
    res.json({ users });
  });

  router.get('/audit', async (req, res) => {
    const events = await AuditLog.findAll({
      include: [{ model: User, attributes: ['email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json({
      events: events.map((e) => ({
        id: e.id, event: e.event, detail: e.detail, ip: e.ip, createdAt: e.createdAt, user: e.User?.email ?? null,
      })),
    });
  });

  router.patch('/users/:id/role', validate(userIdParam, 'params'), validate(roleSchema), async (req, res) => {
    const targetId = req.valid.params.id;
    if (targetId === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
    const target = await User.findByPk(targetId);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const from = target.role;
    await target.update({ role: req.valid.body.role });
    await audit(req, 'role_change', { targetId, from, to: target.role });
    res.json({ id: target.id, role: target.role });
  });

  return router;
}
