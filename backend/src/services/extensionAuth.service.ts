import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ExtensionToken } from '../models/ExtensionToken.model';
import { logger } from '../config/logger';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
// No 0/O or 1/I so codes are easy to type
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** A one-time code the user types into the extension; valid for 10 minutes */
export async function createPairingCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const bytes = crypto.randomBytes(8);
  const code = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  // Only one pending code per user
  await ExtensionToken.deleteMany({ userId, tokenHash: { $exists: false } });
  await ExtensionToken.create({ userId, pairingCodeHash: sha256(code), pairingExpiresAt: expiresAt });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt };
}

/** Exchanges a pairing code for the extension's long-lived token (returned once, stored hashed) */
export async function pairExtension(code: string, label?: string): Promise<string | null> {
  const normalized = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length !== 8) return null;

  const token = `ext_${crypto.randomBytes(32).toString('base64url')}`;
  const record = await ExtensionToken.findOneAndUpdate(
    { pairingCodeHash: sha256(normalized), pairingExpiresAt: { $gt: new Date() }, tokenHash: { $exists: false } },
    {
      $set: { tokenHash: sha256(token), pairedAt: new Date(), lastUsedAt: new Date(), label: label?.slice(0, 60) || 'Chrome extension' },
      $unset: { pairingCodeHash: 1, pairingExpiresAt: 1 }
    },
    { new: true }
  );
  if (!record) return null;
  logger.info(`Extension paired for user ${record.userId}`);
  return token;
}

/** Authenticates extension requests ("Authorization: Bearer ext_…") and sets req.user */
export async function extensionAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ext_') ? header.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ message: 'Extension is not connected. Pair it from the Apply Queue page.' });
    return;
  }

  const record = await ExtensionToken.findOne({ tokenHash: sha256(token), revokedAt: { $exists: false } });
  if (!record) {
    res.status(401).json({ message: 'This extension connection was revoked or is invalid. Pair it again.' });
    return;
  }

  // Throttle last-used writes to once a minute
  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    record.lastUsedAt = new Date();
    await record.save();
  }
  req.user = { userId: record.userId.toString(), email: '' };
  next();
}

export async function listExtensionConnections(userId: string) {
  const tokens = await ExtensionToken.find({ userId, tokenHash: { $exists: true }, revokedAt: { $exists: false } })
    .sort({ pairedAt: -1 }).lean();
  return tokens.map(t => ({ id: t._id.toString(), label: t.label, pairedAt: t.pairedAt, lastUsedAt: t.lastUsedAt }));
}

export async function revokeExtensionConnection(userId: string, id: string): Promise<boolean> {
  const result = await ExtensionToken.updateOne({ _id: id, userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  return result.modifiedCount > 0;
}
